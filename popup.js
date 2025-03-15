document.addEventListener('DOMContentLoaded', function() {
    // Business Tools
    const erpStockBtn = document.getElementById('erpStock');
    const erpWorkflowBtn = document.getElementById('erpWorkflow');
    const erpReportBtn = document.getElementById('erpReport');
    
    // Developer Tools
    const schemaDiffBtn = document.getElementById('schemaDiff');
    const inspectDocTypeBtn = document.getElementById('inspectDocType');
    const apiExplorerBtn = document.getElementById('apiExplorer');
    const debugConsoleBtn = document.getElementById('debugConsole');
    const doctypeInput = document.getElementById('doctypeInput');
    
    const resultDiv = document.getElementById('result');

    // Business Tool Event Listeners
    erpStockBtn.addEventListener('click', execTab('analyzeStock'));
    erpWorkflowBtn.addEventListener('click', execTab('visualizeWorkflow'));
    erpReportBtn.addEventListener('click', execTab('generateReport'));
    
    // Developer Tool Event Listeners
    schemaDiffBtn.addEventListener('click', execTab('schemaDiff'));
    inspectDocTypeBtn.addEventListener('click', () => {
        const doctype = doctypeInput.value.trim();
        execTab('inspectDocType', { doctype })();
    });
    apiExplorerBtn.addEventListener('click', execTab('apiExplorer'));
    debugConsoleBtn.addEventListener('click', execTab('debugConsole'));

    function execTab(action, data = {}) {
        return () => {
            resultDiv.innerHTML = 'Loading...';
            browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
                browser.tabs.sendMessage(tabs[0].id, {action, ...data}).then(response => {
                    if (response?.result) {
                        // Format JSON if present in the result
                        const formattedResult = response.result.replace(/{.*}/gs, match => {
                            try {
                                const obj = JSON.parse(match);
                                return JSON.stringify(obj, null, 2);
                            } catch (e) {
                                return match;
                            }
                        });
                        resultDiv.innerHTML = formattedResult;
                    } else {
                        resultDiv.innerHTML = 'Operation completed';
                    }
                }).catch(error => {
                    resultDiv.innerHTML = `Error: ${error.message}<br>Make sure you're on an ERPNext page.`;
                });
            });
        };
    }
});