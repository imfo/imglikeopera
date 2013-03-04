const EXPORTED_SYMBOLS = ["AddonManager"];

const {
  classes: Cc,
  interfaces: Ci,
  utils: Cu
} = Components;

Cu.import("resource://imglikeopera-modules/Preferences.jsm");

const AddonManager = {
  startup: function AddonManager_startup() {
    this.info = {
      __proto__: null,
      // nsIVersionComparator.compare:
      //   < 0 - current < last
      //   = 0 - current == last
      //   > 0 - curent > last
      addonVersionState: 0,
      // Is version changed?
      get addonVersionChanged() this.addonVersionState != 0,
      // ...up?
      get addonUpgraded() this.addonVersionState > 0,
      // ...or down?
      get addonDowngraded() this.addonVersionState < 0,
      // Previous version.
      addonLastVersion: "0",
      // true == "fresh" install.
      get freshInstall() this.addonLastVersion === "0"
    };
    
    this._start();
  },
  
  shutdown: function AddonManager_shutdown() {
  },
  
  get addonId() {
    return "imglikeopera@imfo.ru";
  },
  
  get addonVersion() {
    // FIXME: %addonVersion%
    return "0.6.24";
  },
  
  get _addonLastInstalledVersion() {
    return Prefs.get("addon.lastVersion", null);
  },
  
  set _addonLastInstalledVersion(aValue) {
    Prefs.set("addon.lastVersion", aValue);
  },
  
  _start: function AddonManager__start() {
    this._checkVersions();
  },
  
  _checkVersions: function AddonManager__checkVersions() {
    let currentVersion = this.addonVersion;
    let lastVersion = this._addonLastInstalledVersion;
    this.info.addonLastVersion = lastVersion;
    
    //if (lastVersion != currentVersion)
      this._addonLastInstalledVersion = currentVersion;
    
    const versionComparator = Cc["@mozilla.org/xpcom/version-comparator;1"].getService(Ci.nsIVersionComparator);
    this.info.addonVersionState = versionComparator.compare(currentVersion, lastVersion);
  },
  
  observe: function AddonManager_observe(aSubject, aTopic, aData) {
    if (aTopic == "quit-application")
      this._shutdown();
  },
  
  _shutdown: function AddonManager__shutdown() {
    Cc["@mozilla.org/observer-service;1"]
      .getService(Ci.nsIObserverService)
      .removeObserver(this, "quit-application");
    
    this._application = null;
    this.info = null;
  }
};
