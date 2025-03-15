browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    // Helper function to wait for ERPNext (Frappe v15)
    function waitForERPNext(timeout = 30000, retries = 5) {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const start = Date.now();

            function checkFrappeInFrame(frame) {
                try {
                    const hasFrappe = frame.frappe && typeof frame.frappe === 'object';
                    console.log(`Frame check: frappe=${hasFrappe}, version=${frame.frappe?.version}, boot=${!!frame.frappe?.boot}`);
                    return hasFrappe;
                } catch (e) {
                    console.log("Frame access error:", e.message);
                    return false;
                }
            }

            function checkERPNextIndicators() {
                const scripts = document.querySelectorAll('script');
                let found = false;
                for (let script of scripts) {
                    const src = script.src || '';
                    const content = script.textContent || '';
                    if (src.includes('app.js') || src.includes('frappe') || src.includes('erpnext') || content.includes('frappe.')) {
                        console.log(`ERPNext script found: ${src || 'inline script'}`);
                        found = true;
                    }
                }
                if (document.querySelector('.navbar-brand') || document.querySelector('[data-doctype]') || document.title.includes('ERPNext')) {
                    console.log("ERPNext DOM indicator found");
                    found = true;
                }
                return found;
            }

            function tryExtractFrappe() {
                const scripts = document.querySelectorAll('script');
                for (let script of scripts) {
                    if (script.textContent.includes('frappe.')) {
                        try {
                            const fn = new Function(script.textContent + '; if (typeof frappe !== "undefined") window.frappe = frappe;');
                            fn.call(window);
                            if (window.frappe) {
                                console.log("Extracted frappe from inline script:", Object.keys(window.frappe));
                                return true;
                            }
                        } catch (e) {
                            console.log("Failed to extract frappe:", e.message);
                        }
                    }
                }
                return false;
            }

            function check() {
                const frames = [window, ...Array.from(window.frames)];
                console.log(`Checking ${frames.length} frames at ${Date.now() - start}ms on ${window.location.href}`);
                for (let frame of frames) {
                    if (checkFrappeInFrame(frame)) {
                        window.frappe = frame.frappe;
                        console.log("ERPNext detected:", Object.keys(window.frappe));
                        resolve(true);
                        return;
                    }
                }

                const hasIndicators = checkERPNextIndicators();
                if (hasIndicators) {
                    if (tryExtractFrappe()) {
                        resolve(true);
                        return;
                    }
                    console.log("ERPNext indicators present but frappe undefined");
                }

                if (Date.now() - start > timeout) {
                    attempts++;
                    if (attempts >= retries) {
                        console.log("ERPNext detection failed");
                        reject(new Error(`ERPNext not detected after ${retries} retries${hasIndicators ? ' (indicators present)' : ''}`));
                    } else {
                        console.log(`Retry ${attempts}/${retries}`);
                        setTimeout(check, 1000);
                    }
                } else {
                    setTimeout(check, 100);
                }
            }

            if (document.readyState === 'complete') {
                check();
            } else {
                window.addEventListener('load', check, {once: true});
                console.log("Waiting for page load");
            }
        });
    }

    async function handleERPNextAction(actionFn) {
        try {
            await waitForERPNext();
            return actionFn();
        } catch (e) {
            sendResponse({result: `${e.message}<br>URL: ${window.location.href}`});
        }
    }

    if (message.action === "analyzeStock") {
        handleERPNextAction(() => {
            browser.runtime.sendMessage({
                action: "apiCall",
                url: `${location.origin}/api/method/frappe.desk.query_report.run`,
                data: {
                    report_name: "Stock Balance",
                    filters: JSON.stringify({
                        warehouse: "All Warehouses - " + frappe.boot.sysdefaults.company, // Default company suffix
                        item_code: "" // All items
                    })
                },
                token: frappe.csrf_token
            }).then(response => {
                if (response.success && response.data?.result) {
                    sendResponse({
                        result: `Stock Balance:<br>${JSON.stringify(response.data.result)}`
                    });
                } else {
                    sendResponse({
                        result: `Error: ${response.error || 'Stock Balance report failed'}`
                    });
                }
            }).catch(error => {
                sendResponse({
                    result: `Error: ${error.message}`
                });
            });
            return true;
        });
        return true;
    }

    if (message.action === "visualizeWorkflow") {
        handleERPNextAction(() => {
            const workflows = frappe.boot?.workflow_states || {};
            let result = "Workflow States:<br>";
            for (let [doctype, states] of Object.entries(workflows)) {
                result += `${doctype}: ${Object.keys(states).join(' -> ')}<br>`;
            }
            sendResponse({result});
        });
        return true;
    }

    if (message.action === "generateReport") {
        handleERPNextAction(() => {
            browser.runtime.sendMessage({
                action: "apiCall",
                url: `${location.origin}/api/method/frappe.desk.reportview.get`,
                data: {
                    doctype: frappe.boot?.sysdefaults?.doctype || 'Item',
                    fields: JSON.stringify(['name', 'modified']),
                    filters: JSON.stringify([])
                },
                token: frappe.csrf_token
            }).then(response => {
                sendResponse({
                    result: response.success ? 
                        `Report Data:<br>${JSON.stringify(response.data.message)}` : 
                        `Error: ${response.error}`
                });
            });
            return true;
        });
        return true;
    }

    if (message.action === "schemaDiff") {
        handleERPNextAction(() => {
            const currentSchema = JSON.stringify(frappe.meta?.docfield_map || {});
            browser.storage.local.get(['prevSchema']).then(result => {
                const prev = result.prevSchema || '{}';
                const diff = compareSchemas(prev, currentSchema);
                browser.storage.local.set({prevSchema: currentSchema}).then(() => {
                    sendResponse({result: `Schema Changes:<br>${diff || 'No changes'}`});
                });
            });
            return true;
        });
        return true;
    }

    return true;
});

function compareSchemas(prev, curr) {
    const p = JSON.parse(prev), c = JSON.parse(curr);
    let changes = '';
    for (let dt in c) {
        if (!p[dt]) changes += `Added DocType: ${dt}<br>`;
        else {
            for (let f in c[dt]) {
                if (!p[dt][f]) changes += `Added field ${f} to ${dt}<br>`;
                else if (JSON.stringify(p[dt][f]) !== JSON.stringify(c[dt][f])) 
                    changes += `Modified ${f} in ${dt}<br>`;
            }
        }
    }
    return changes;
}