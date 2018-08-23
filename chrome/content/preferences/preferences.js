const {
    classes: Cc,
    interfaces: Ci,
    utils: Cu,
    Constructor: CC
} = Components;

const Preferences = {
  get ImgLikeOpera() {
    delete this.ImgLikeOpera;
    return this.ImgLikeOpera = Cc["@mozilla.org/imglikeopera;1"].getService().wrappedJSObject;
  },
  
  get strBundleManager() {
    delete this.strBundleManager;
    return this.strBundleManager = this.ImgLikeOpera.strBundleManager;
  },
  
  get settings() {
    return this.ImgLikeOpera.settings;
  },
  
  _initPane: function Preferences__initPane(aPaneId) {
    let paneElement = document.getElementById(aPaneId);
    if (!paneElement)
      return;
    
    if (document.documentElement.currentPane != paneElement)
        document.documentElement.showPane(paneElement);
    
    if (!paneElement.loaded)
      return;
    
    if (paneElement.getAttribute("ilo-pane-ready") == "true")
      return;
    
    switch (aPaneId) {
      case "prefpane-main": {
        // Build fonts
        const fontEnumerator = Cc["@mozilla.org/gfx/fontenumerator;1"]
                                         .createInstance()
                                         .QueryInterface(Ci.nsIFontEnumerator);
        
        let allFonts = fontEnumerator.EnumerateAllFonts({});
        
        let fontMenu = document.getElementById("placeholders-font-name-menulist");
        let preference = document.getElementById(fontMenu.getAttribute("preference"));
        
        for (let i = 0, len = allFonts.length; i < len; i++)
          fontMenu.appendItem(allFonts[i], allFonts[i]);
        
        preference.setElementValue(fontMenu);
        
        break;
      } // case "prefpane-main"
      
      case "prefpane-filters":
        Filters.startup();
        break;
    }
    
    paneElement.setAttribute("ilo-pane-ready", "true");
  },
  
  get instantApply() {
    return document.documentElement.instantApply;
  },
  
  _accepted: false,
  
  beforeAccept: function Preferences_beforeAccept() {
    if (!this._accepted) {
      this._apply();
      this._accepted = true;
    }
    
    return true;
  },
  
  onUnload: function Preferences_onUnload() {
    if (this.instantApply)
      this.beforeAccept();
    
    if (!this._accepted)
      this._cancel();
  },
  
  _apply: function Preferences__apply() {
    Filters.save();
  },
  
  _cancel: function Preferences__cancel() {
  },
  
  handleEvent: function Preferences_handleEvent(aEvent) {
    switch (aEvent.type) {
      case "load": // window.onload
        aEvent.currentTarget.removeEventListener("load", arguments.callee, false);
        break;
      
      case "paneload":
        this._initPane(aEvent.target.id);
        break;
      
      default:
        break;
    }
  },
  
  syncFromPref: function Preferences_syncFromPref(aElement) {
    if (!aElement)
      throw new Error("Preferences_syncFromPref: no element given.");
    
    if (aElement.id == "checkbox-linked-images") {
      let preference = document.getElementById("load-linked-images");
      let actualValue = typeof preference.value != "undefined" ? preference.value : preference.defaultValue;
      
      let origCheckbox = document.getElementById("checkbox-linked-images-orig-site");
      origCheckbox.disabled = !actualValue;
      
      return;
    }
    
    let policySwitchModeIdPrefix = "policy-switch-modes-chk-";
    let policySwitchMode = aElement.id.split(policySwitchModeIdPrefix)[1];
    if (policySwitchMode) {
      let preference = document.getElementById("policy-switchModes");
      let actualValue = typeof preference.value != "undefined" ? preference.value : preference.defaultValue;
      let modesValue = (actualValue || "1,2,3,4")
                         .split(",")
                         .map(function(mode) {parseInt(mode, 10)})
                         .filter(function(mode) {mode >= 1 && mode <= 4})
                         .sort();
      
      if (!modesValue.length)
        modesValue = [1,2,3,4];
      
      return modesValue.indexOf(+policySwitchMode) != -1;
    }
  },
  
  syncToPref: function Preferences_syncToPref(aElement) {
    if (!aElement)
      throw new Error("Preferences_syncFromPref: no element given.");
    
    let policySwitchModeIdPrefix = "policy-switch-modes-chk-";
    let policySwitchMode = aElement.id.split(policySwitchModeIdPrefix)[1];
    if (policySwitchMode) {
      let modesValue = [];
      for (let i = 0; ++i < 5;) {
        let element = document.getElementById(policySwitchModeIdPrefix + i);
        if (element.checked)
          modesValue.push(i);
      }
      
      return modesValue.length ? modesValue.sort().join(",") : "1,2,3,4";
    }
  }
};

Object.defineProperty(this, "Preferences", {
  value: Preferences,
  enumerable: true,
  writable: false
});

window.addEventListener("load", Preferences, false);
window.addEventListener("paneload", Preferences, false);
