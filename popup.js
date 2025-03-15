document.addEventListener('DOMContentLoaded', function() {
    const erpStockBtn = document.getElementById('erpStock');
    const erpWorkflowBtn = document.getElementById('erpWorkflow');
    const erpReportBtn = document.getElementById('erpReport');
    const schemaDiffBtn = document.getElementById('schemaDiff');
    const resultDiv = document.getElementById('result');

    erpStockBtn.addEventListener('click', execTab('analyzeStock'));
    erpWorkflowBtn.addEventListener('click', execTab('visualizeWorkflow'));
    erpReportBtn.addEventListener('click', execTab('generateReport'));
    schemaDiffBtn.addEventListener('click', execTab('schemaDiff'));

    function execTab(action, data = {}) {
        browser.tabs.query({active: true, currentWindow: true}).then(tabs => {
            browser.tabs.sendMessage(tabs[0].id, {action, ...data}).then(response => {
                resultDiv.innerHTML = response?.result || 'Operation completed';
            }).catch(error => {
                resultDiv.innerHTML = `Error: ${error.message}`;
            });
        });
    }
});