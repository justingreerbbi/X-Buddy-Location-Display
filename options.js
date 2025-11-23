// Options script
document.addEventListener('DOMContentLoaded', function () {
    const debugCheckbox = document.getElementById('debug');
    const saveButton = document.getElementById('save');

    // Load current setting
    chrome.storage.sync.get('debug', function (data) {
        debugCheckbox.checked = data.debug || false;
    });

    // Save setting
    saveButton.addEventListener('click', function () {
        chrome.storage.sync.set({ debug: debugCheckbox.checked }, function () {
            alert('Settings saved!');
        });
    });
});