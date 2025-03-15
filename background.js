browser.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.action === "apiCall") {
            fetch(request.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Frappe-CSRF-Token': request.token
                },
                body: JSON.stringify(request.data)
            })
            .then(response => response.json())
            .then(data => sendResponse({success: true, data: data}))
            .catch(error => sendResponse({success: false, error: error.message}));
            return true;
        }
    }
);