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
                        // Initialize developer tools
                        initDevTools(frame.frappe);
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

    // Initialize developer tools and monitoring
    function initDevTools(frappe) {
        // Setup performance monitoring
        window._frappeDevTools = {
            apiCalls: [],
            events: [],
            perfMetrics: {
                pageLoad: performance.now(),
                apiLatency: {}
            }
        };

        // Monitor API calls
        const originalCall = frappe.call;
        frappe.call = function(opts) {
            const startTime = performance.now();
            const callId = Date.now();
            window._frappeDevTools.apiCalls.push({
                id: callId,
                method: opts.method,
                args: opts.args,
                timestamp: new Date().toISOString()
            });

            return originalCall.apply(this, arguments).then(result => {
                window._frappeDevTools.apiLatency[callId] = performance.now() - startTime;
                return result;
            });
        };

        // Monitor Frappe events
        const originalTrigger = frappe.event_hub.trigger;
        frappe.event_hub.trigger = function(event, data) {
            window._frappeDevTools.events.push({
                event,
                data,
                timestamp: new Date().toISOString()
            });
            return originalTrigger.apply(this, arguments);
        };
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

    if (message.action === "inspectDocType") {
        handleERPNextAction(() => {
            const doctype = message.doctype || frappe.boot?.sysdefaults?.doctype;
            if (!doctype) {
                sendResponse({result: "No DocType specified"});
                return;
            }

            browser.runtime.sendMessage({
                action: "apiCall",
                url: `${location.origin}/api/method/frappe.desk.form.load.getdoctype`,
                data: {
                    doctype: doctype,
                    with_parent: 1
                },
                token: frappe.csrf_token
            }).then(response => {
                if (response.success && response.data?.docs) {
                    const doc = response.data.docs[0];
                    const analysis = {
                        fields: doc.fields.length,
                        mandatoryFields: doc.fields.filter(f => f.reqd).length,
                        linkedDocTypes: doc.fields.filter(f => f.fieldtype === 'Link').map(f => f.options),
                        permissions: doc.permissions,
                        workflows: frappe.boot?.workflow_states?.[doctype] || []
                    };
                    sendResponse({
                        result: `DocType Analysis (${doctype}):<br>${JSON.stringify(analysis, null, 2)}`
                    });
                } else {
                    sendResponse({
                        result: `Error: ${response.error || 'Failed to load DocType'}`
                    });
                }
            });
            return true;
        });
        return true;
    }

    if (message.action === "debugConsole") {
        handleERPNextAction(() => {
            const devTools = window._frappeDevTools || {};
            const summary = {
                recentApiCalls: devTools.apiCalls?.slice(-5) || [],
                recentEvents: devTools.events?.slice(-5) || [],
                performance: {
                    pageLoadTime: devTools.perfMetrics?.pageLoad,
                    averageApiLatency: Object.values(devTools.apiLatency || {}).reduce((a, b) => a + b, 0) / 
                        (Object.values(devTools.apiLatency || {}).length || 1)
                }
            };
            sendResponse({
                result: `Debug Console Summary:<br>${JSON.stringify(summary, null, 2)}`
            });
        });
        return true;
    }

    if (message.action === "apiExplorer") {
        handleERPNextAction(() => {
            const commonApis = [
                {method: 'frappe.client.get_list', description: 'Get DocType List'},
                {method: 'frappe.client.get', description: 'Get Single Doc'},
                {method: 'frappe.desk.reportview.get', description: 'Get Report View'},
                {method: 'frappe.desk.search.search_link', description: 'Search Link Field'}
            ];

            const recentCalls = window._frappeDevTools?.apiCalls || [];
            sendResponse({
                result: `API Explorer:<br>Common APIs:<br>${JSON.stringify(commonApis, null, 2)}<br><br>` +
                        `Recent API Calls:<br>${JSON.stringify(recentCalls, null, 2)}`
            });
        });
        return true;
    }

    if (message.action === "schemaDiff") {
        handleERPNextAction(() => {
            const currentSchema = {
                docTypes: Object.keys(frappe.meta?.docfield_map || {}),
                customFields: frappe.boot?.custom_fields || {},
                propertySetters: frappe.boot?.property_setters || {},
                customScripts: frappe.boot?.custom_scripts || {}
            };

            browser.storage.local.get(['prevSchema']).then(result => {
                const prev = JSON.parse(result.prevSchema || '{}');
                const diff = compareEnhancedSchemas(prev, currentSchema);
                browser.storage.local.set({prevSchema: JSON.stringify(currentSchema)}).then(() => {
                    sendResponse({
                        result: `Enhanced Schema Changes:<br>${JSON.stringify(diff, null, 2)}`
                    });
                });
            });
            return true;
        });
        return true;
    }

    return true;
});

function compareEnhancedSchemas(prev, curr) {
    const changes = {
        docTypes: {
            added: curr.docTypes.filter(dt => !prev.docTypes?.includes(dt)),
            removed: (prev.docTypes || []).filter(dt => !curr.docTypes.includes(dt))
        },
        customFields: compareObjects(prev.customFields, curr.customFields, 'Custom Fields'),
        propertySetters: compareObjects(prev.propertySetters, curr.propertySetters, 'Property Setters'),
        customScripts: compareObjects(prev.customScripts, curr.customScripts, 'Custom Scripts')
    };
    return changes;
}

function compareObjects(prev = {}, curr = {}, type) {
    const changes = {
        added: [],
        modified: [],
        removed: []
    };

    // Check for additions and modifications
    for (const key in curr) {
        if (!prev[key]) {
            changes.added.push(key);
        } else if (JSON.stringify(prev[key]) !== JSON.stringify(curr[key])) {
            changes.modified.push(key);
        }
    }

    // Check for removals
    for (const key in prev) {
        if (!curr[key]) {
            changes.removed.push(key);
        }
    }

    return changes;
}