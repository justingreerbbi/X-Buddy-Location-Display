// Account tab logic for X Buddy Chrome extension

document.addEventListener("DOMContentLoaded", () => {
  const statusDiv = document.getElementById("accountStatus");
  const actionsDiv = document.getElementById("accountActions");
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");

  // Placeholder: Replace with real authentication check
  chrome.storage.sync.get(["xbuddyUser"], (data) => {
    const user = data.xbuddyUser;
    if (user && user.loggedIn) {
      statusDiv.textContent = `Logged in as ${user.username}`;
      actionsDiv.style.display = "none";
    } else {
      statusDiv.textContent = "Not logged in.";
      actionsDiv.style.display = "flex";
    }
  });

  loginBtn.addEventListener("click", () => {
    // Placeholder: Implement login logic
    alert("Login flow not implemented.");
  });

  registerBtn.addEventListener("click", () => {
    // Placeholder: Implement register logic
    alert("Register flow not implemented.");
  });
});
