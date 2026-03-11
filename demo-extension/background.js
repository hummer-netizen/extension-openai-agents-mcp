browser.browserAction.setPopupStyles({
    backgroundColor: "#0f0f1aF0",
    borderRadius: "12px",
});
browser.browserAction.resizePopup(340, 580);
browser.browserAction.setPopupPosition({ top: "10px", right: "10px" });
browser.browserAction.detachPopup();
browser.browserAction.openPopup();
