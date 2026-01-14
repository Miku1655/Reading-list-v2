auth.onAuthStateChanged(user => {
    currentUser = user;
    const syncStatus = document.getElementById("syncStatus");
    const signInBtn = document.getElementById("signInBtn");
    const signUpBtn = document.getElementById("signUpBtn");
    const signOutBtn = document.getElementById("signOutBtn");
    const cloudButtons = document.getElementById("cloudButtons");
    const coverCloudButtons = document.getElementById("coverCloudButtons");

    if (user) {
        userRef = db.ref("users/" + user.uid);
        syncStatus.textContent = `Signed in as ${user.email} (manual sync)`;
        signInBtn.style.display = "none";
        signUpBtn.style.display = "none";
        signOutBtn.style.display = "inline-block";
        cloudButtons.style.display = "block";
        coverCloudButtons.style.display = "block";
    } else {
        userRef = null;
        syncStatus.textContent = "Not signed in (local only)";
        signInBtn.style.display = "inline-block";
        signUpBtn.style.display = "inline-block";
        signOutBtn.style.display = "none";
        cloudButtons.style.display = "none";
        coverCloudButtons.style.display = "none";
    }
    loadLocalData();
    renderAll();
});
