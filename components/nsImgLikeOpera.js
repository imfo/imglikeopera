"use strict";

/************************************************************************
 *
 * Constants and vars
 *
 ************************************************************************/
const {
  classes: Cc,
  interfaces: Ci,
  results: Cr,
  utils: Cu
} = Components;

// extension
const EXT_ID = "imglikeopera@imfo.ru";
const CHROME_CONTENT = "chrome://imglikeopera/content/";

// nsIContentPolicy
const REJECT                    = Ci.nsIContentPolicy.REJECT_REQUEST;
const ACCEPT                    = Ci.nsIContentPolicy.ACCEPT;

const TYPE_IMAGE                = Ci.nsIContentPolicy.TYPE_IMAGE;
const TYPE_OBJECT               = Ci.nsIContentPolicy.TYPE_OBJECT;

// nsIDOMNode
const TYPE_DOCUMENT_NODE        = Ci.nsIDOMNode.DOCUMENT_NODE;

// cache stuff
const nsICache                  = Ci.nsICache;
const nsICacheEntryDescriptor   = Ci.nsICacheEntryDescriptor;

/************************************************************************/

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

function makeURI(aURL, aOriginCharset, aBaseURI) {
  var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  return ioService.newURI(aURL, aOriginCharset, aBaseURI);
}


/************************************************************************
 *
 * Smthng...
 *
 ************************************************************************/

(function(that) {
  function CacheListener() {
    this.done = false;
  }

  CacheListener.prototype = {
    onCacheEntryCheck: function (entry, appcache) {
			return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
		},
		onCacheEntryAvailable: function (entry, isnew, appcache, status) {
			this.descriptor = entry;
      this.status = status;
      this.done = true;
    },
    QueryInterface: function(iid) {
      if (iid.equals(Ci.nsISupports) || iid.equals(Ci.nsICacheEntryOpenCallback))
        return this;
      throw Cr.NS_NOINTERFACE;
    }
  };
  
  const THREAD_MANAGER = Cc["@mozilla.org/thread-manager;1"].getService();
  
  that.syncGetCacheEntry = function syncGetCacheEntry(aCacheSession, aKey) {
    let startTime = Date.now();
    let listener = new CacheListener();
    aCacheSession.asyncOpenURI(makeURI(aKey), "", Ci.nsICacheStorage.OPEN_READONLY, listener);
    
    while (!(listener.done || Math.abs(Date.now() - startTime) > 5000)) {
      // if (Math.abs(Date.now() - startTime) > 5000)
      //   dump("Too long syncGetCacheEntry\n");
      
      THREAD_MANAGER.currentThread.processNextEvent(false);
    }
    
    return listener;
  }
})(this);

function nsImgLikeOpera() {
  this.debug = false;
  
  this.wrappedJSObject = this;
  
  // cache sessions
  let {LoadContextInfo} = Cu.import(
		"resource://gre/modules/LoadContextInfo.jsm", {});
	const CACHE_SERVICE = Cc["@mozilla.org/netwerk/cache-storage-service;1"].getService(Ci.nsICacheStorageService);
	let httpCacheSession  = CACHE_SERVICE.diskCacheStorage(LoadContextInfo.default, false);
  
  this.cacheSessions = [httpCacheSession];
  
  Services.obs.addObserver(this, "profile-after-change", false);
  Services.obs.addObserver(this, "profile-before-change", false);
}

/**
 * JS XPCOM component registration
 */
nsImgLikeOpera.prototype = {
  classDescription: "nsImgLikeOpera JS component",
  classID: Components.ID("{9aa46f4f-4dc7-4c06-97af-5035170633fe}"),
  contractID: "@mozilla.org/imglikeopera;1",
  
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsISupports,
    Ci.nsIContentPolicy,
    Ci.nsIObserver,
    Ci.nsISupportsWeakReference
  ]),
    
  _xpcom_categories: [
    { category: "app-startup", service: true },
    { category: "content-policy", service: true }
  ],
  
  observe: function ILO_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        ["Preferences",
         "AddonManager",
         "Settings",
         "DocumentData",
         "FileUtils"
        ].forEach(function(moduleName) Cu.import("resource://imglikeopera-modules/" + moduleName + ".jsm"));
        
        // TODO: loader/unloader
        AddonManager.startup();
        
        this._migrateOldPreferences();
        
        // Set native browser policy: "Load All Images".
        Preferences.set("permissions.default.image", 1);
        // Preferences.set("browser.display.show_image_placeholders", true);
        // Preferences.set("browser.display.force_inline_alttext", false);
        
        this.settings = Settings;
        
        this.loadUserCss();
        
        Prefs.observe2("", this);
        
        this.sessionStore.init();
        
        break;
      
      case "profile-before-change":
        this.sessionStore.uninit();
        
        Prefs.ignore2("", this);
        this.settings = null;
        
        // TODO: loader/unloader
        AddonManager.shutdown();
        
        break;
      
      case "app-startup":
        break;
      
      case "nsPref:changed":
        let prefName = aData.split(Prefs.prefBranch)[1];
        
        switch (prefName) {
          case "policy.switchModes":
            this._policySwitchModes = null;
            break;
          
          case "policy.patterns":
            this.policyPatternsArray = null;
            break;
            
          case "placeholders.font":
            this.loadUserCss();
            break;
        }
        break;
      
      default:
        break;
    }
  },
  
  _migrateOldPreferences: function ILO__migrateOldPreferences() {
    if (!AddonManager.info.addonUpgraded || AddonManager.info.addonLastVersion >= "0.6.21")
      return;
    
    try {
      let oldPreferences = new Preferences("imglikeopera.");
      
      let defaultPolicyValue = oldPreferences.get("default.policy", 0);
      let startupPolicyValue = oldPreferences.get("startup.policy", 0);
      
      let policy = startupPolicyValue || defaultPolicyValue;
      if (policy)
        Prefs.set("policy.default", policy);
      if (startupPolicyValue)
        Prefs.set("policy.inherit", true);
      
      let oldPrefName = "load.linked.images";
      if (oldPreferences.has(oldPrefName)) {
        let val = oldPreferences.get(oldPrefName, 0);
        oldPreferences.reset(oldPrefName);
        if (val) {
          Prefs.set("load.linked.images", true);
          if (val == 2)
            Prefs.set("load.linked.imagesorig", true);
        }
      }
      
      oldPrefName = "placeholders.font";
      if (oldPreferences.has(oldPrefName)) {
        let val = oldPreferences.get(oldPrefName, ",");
        oldPreferences.reset(oldPrefName);
        if (val && val.indexOf(",") > 0) {
          let [fontName, fontSize] = val.split(",");
          Prefs.set("placeholders.font.name", fontName);
          
          fontSize = parseInt(fontSize, 10);
          if (fontSize > 0 && fontSize <= 72)
            Prefs.set("placeholders.font.size", fontSize);
        }
      }
      
      ["default.policy", "startup.policy", "policy.patterns",
       "expiration.time", "tabs.refresh", "esc.key",
       "experimental.options", "flash.block", "delay.load"
      ].forEach(function(prefName) {
        if (oldPreferences.has(prefName)) {
          let val = oldPreferences.get(prefName, null);
          oldPreferences.reset(prefName);
          if (val !== null && Prefs.has(prefName))
            Prefs.set(prefName, val);
        }
      });
    } catch(e) {
      Cu.reportError("gILO.migrateOldPreferences error:\n" + e);
    }
  },
  
  /**
   * On (first) chrome window load.
   *
   * Add toolbarbutton after addon install.
   */
  onChromeWindowLoad: function ILO_onChromeWindowLoad(aChromeWindow) {
    this.onChromeWindowLoad = function() {};
    
    if (!AddonManager.info.freshInstall)
      return;
    
    const buttonId = "ilo-toolbar-button";
    
    let doc = aChromeWindow.document;
    if (doc.getElementById(buttonId))
      return;
    
    let toolbar = doc.getElementById("addon-bar") || doc.getElementById("nav-bar");
    if (toolbar && typeof toolbar.insertItem == "function") {
      toolbar.insertItem(buttonId, null);
      
      toolbar.setAttribute("currentset", toolbar.currentSet);
      doc.persist(toolbar.id, "currentset");
      
      if (toolbar.getAttribute("collapsed") == "true") {
        toolbar.setAttribute("collapsed", "false");
        doc.persist(toolbar.id, "collapsed");
      }
    }
  },
  
  /**
   * Policy switch modes.
   */
  _policySwitchModes: null,
  
  get policySwitchModes() {
    if (this._policySwitchModes === null) {
      let modesValue = (this.settings.policy_switchModes || "1,2,3,4")
                         .split(",")
                         .map(function(mode) parseInt(mode, 10))
                         .filter(function(mode) mode >= 1 && mode <= 4);
      
      if (!modesValue.length)
        modesValue = [1,2,3,4];
      
      this._policySwitchModes = modesValue;
    }
    
    return this._policySwitchModes;
  },
  
  set policySwitchModes(aValue) {
    this._policySwitchModes = aValue;
  },
  
  /**
   * UserCSS
   */
  get userCssFontData() {
    return [ this.settings.placeholders_font_name,
             this.settings.placeholders_font_size ];
  },
  
  loadUserCss: function ILO_loadUserCss() {
    let cssFileContent = FileUtils.readFile("$skin/user.chrome.css");
    
    let fontSettings = "";
    let [fontFamily, fontSize] = this.userCssFontData;
    
    if (fontFamily)
      fontSettings += "font-family:" + fontFamily + " !important;";
    
    if (fontSize)
      fontSettings += "font-size:" + fontSize + "px !important;";
    
    if (fontSettings)
      cssFileContent = cssFileContent.replace(/\/\*font\*\//, fontSettings);
    
    const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    let u = Services.io.newURI("data:text/css," + cssFileContent, null, null);
    
    if (sss.sheetRegistered(u, sss.USER_SHEET))
      sss.unregisterSheet(u, sss.USER_SHEET);
    
    sss.loadAndRegisterSheet(u, sss.USER_SHEET);
  },
  
  /**
   * StringBundleService helpers
   */
  strBundleManager: {
    get bundle() {
      let bundle = Services.strings.createBundle("chrome://imglikeopera/locale/imglikeopera.properties");
      delete this.bundle;
      return (this.bundle = bundle);
    },
    
    getString: function SBM_getString(aName) {
      return this.bundle.GetStringFromName(aName);
    },
    
    getFormattedString: function SBM_getFormattedString(aName, aStrArray) {
      return this.bundle.formatStringFromName(aName, aStrArray, aStrArray.length);
    }
  },
  
  /**
   * SessionStore helpers
   */
  sessionStore: {
    get _sessionStoreService() {
      delete this._sessionStoreService;
      return (this._sessionStoreService = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore));
    },
    
    _enabled: false,
    
    init: function SStore_init() {
      this._enabled = true;
    },
    
    uninit: function SStore_uninit() {
      this._enabled = false;
    },
    
    setTabPolicy: function SStore_setTabPolicy(aTab, aPolicy) {
      if (!this._enabled)
        return;
      
      try {
        this._sessionStoreService.setTabValue(aTab, "ilo-tab-policy", aPolicy);
      } catch(e) {}
    },
    
    getTabPolicy: function SStore_getTabPolicy(aTab) {
      if (!this._enabled)
        return null;
      
      let policy = NaN;
      try {
        policy = parseInt(this._sessionStoreService.getTabValue(aTab, "ilo-tab-policy"), 10);
      } catch(e) {}
      
      return isNaN(policy) ? null : policy;
    }
  },
  
  /**
   * Set data container for tab
   */
  setupDocData: function ILO_setupDocData(aTab) {
    return new DocumentData(aTab, this.settings.delay_load);
  },
  
  /**
   * Get window (getWinForObject) and top window (getTopWinForObject) for document node
   */
  getWinForObject: function ILO_getWinForObject(aNode) {
    if (aNode && aNode.nodeType != TYPE_DOCUMENT_NODE)
      aNode = aNode.ownerDocument;
    
    if (!aNode || aNode.nodeType != TYPE_DOCUMENT_NODE)
      return null;
    
    return aNode.defaultView;
  },
  
  getTopWinForObject: function ILO_getTopWinForObject(aNode) {
    let wnd = this.getWinForObject(aNode);
    return wnd ? wnd.top : null;
  },
  
  /**
   * Policy (shouldProcess/shouldLoad)
   */
  shouldProcess: function ILO_shouldProcess() ACCEPT,
  
  /**
   * So... should load?
   */
  shouldLoad: function ILO_shouldLoad(contentType, contentLocation, context, obj) {
    if (contentLocation.scheme != "http" && contentLocation.scheme != "https")
      return ACCEPT;
    
    if (!obj)
      return ACCEPT;
    
    if (contentType != TYPE_IMAGE && (contentType != TYPE_OBJECT || !this.settings.flash_block))
      return ACCEPT;
    
    let topWnd = this.getTopWinForObject(obj);
    if (!topWnd || !topWnd.location || !topWnd.location.href)
      return ACCEPT;
    
    let tab;
    let doc = topWnd.document;
    let docData = doc.iloData;
    
    if (!docData) {
      let docShellTree = topWnd.QueryInterface(Ci.nsIInterfaceRequestor)
                               .getInterface(Ci.nsIWebNavigation)
                               .QueryInterface(Ci.nsIDocShellTreeItem);
      
      if (docShellTree.itemType == Ci.nsIDocShellTreeItem.typeContent) {
        try {
          tab = docShellTree.rootTreeItem
                            .QueryInterface(Ci.nsIInterfaceRequestor)
                            .getInterface(Ci.nsIDOMWindow)
                            .wrappedJSObject
                            .getBrowser()
                            .getBrowserForDocument(doc);
        } catch(e) {}
      }
      
      if (!tab)
        return ACCEPT;
      
      docData = this.setupDocData(tab);
    }
    
    if (!docData || !docData.policy)
      return ACCEPT; // smthng wrng
    
    let url = contentLocation.spec;
    
    let docPolicy = docData.policy;
    let fromCss = (contentType == TYPE_IMAGE && obj.nodeType == TYPE_DOCUMENT_NODE);
    
    if (!fromCss) {
      let fixAttr = obj.getAttribute("ilo-ph-fix");
      
      if (fixAttr)
        return fixAttr == "mustLoad" ?
               this.passObj(obj) : this.blockObj(obj, contentType);
      
      this.changeNodeAttr(obj, "setAttribute", ["ilo-full-src", url]);
    }
    
    if (docData.delayPolicy) {
      if (!fromCss)
        this.changeNodeAttr(obj, "setAttribute", ["ilo-ph-fix", "delay"]);
      
      return REJECT;
    }
    
    if (docPolicy == 3 && !fromCss && this.settings.load_linked_images && obj.parentNode.tagName == "A") {
      // Load linked images in "Load cached images" mode
      docPolicy = this.settings.load_linked_imagesorig
                      ? (this.isThirdPartyHost(doc.location.host, obj.parentNode.host) ? docPolicy : 1)
                      : 1;
    } else {
      switch (docData.getURLStatus(url)) {
        case docData.URL_BLOCK:
          return fromCss ? REJECT : this.blockObj(obj, contentType);
        
        case docData.URL_PASS:
          return fromCss ? ACCEPT : this.passObj(obj);
      }
    }
    
    // check requested URL in USER filters
    docPolicy = this.getPolicyFromFilters(doc.location, url) || docPolicy;
    
    // "Don't load images" => skip work with cache, return false.
    if (docPolicy == 4)
      return fromCss ? REJECT : this.blockObj(obj, contentType);
    
    let expire = this.checkUrlInCache(url, docPolicy);
    let passIt = true;
    
    switch (docPolicy) {
      case 2:
        passIt = expire ? !this.isThirdPartyHost(doc.location.host, contentLocation.host) : true;
        break;
      
      case 3:
        passIt = !expire;
        break;
    }
    
    if (passIt) {
      docData.passURL(url);
      return fromCss ? ACCEPT : this.passObj(obj);
    } else {
      docData.blockURL(url);
      return fromCss ? REJECT : this.blockObj(obj, contentType);
    }
    
    // problems? => always return true
    return ACCEPT;
  },
  
  changeNodeAttr: function ILO_changeNodeAttr(aNode, aAction, aActionArguments) {
    if (!(aNode instanceof Ci.nsIDOMNode))
      return;
    
    let wnd = this.getWinForObject(aNode);
    if (!wnd)
      return;
    
    wnd.setTimeout(function() aNode[aAction].apply(aNode, aActionArguments), 0);
  },
  
  _getObjectWidthAndHeight: function ILO__getObjectWidthAndHeight(aObject) {
    return [ parseInt(aObject.getAttribute("width") || aObject.style.width, 10),
             parseInt(aObject.getAttribute("height") || aObject.style.height, 10) ];
  },
  
  blockObj: function ILO_blockObj(obj, contentType) {
    if (obj.hasAttribute("ilo-ph-fix"))
      return REJECT;
    
    let fixAttr = "fixed";
    
    if (contentType == TYPE_OBJECT) {
      fixAttr = "active";
    }
    else if (obj.tagName.toLowerCase() != "input") {
      let [oWidth, oHeight] = this._getObjectWidthAndHeight(obj);
      
      if (!obj.hasAttribute("alt")) {
        let altText = this.settings.placeholders_alt_text;
        if (altText)
          this.changeNodeAttr(obj, "setAttribute", ["alt", altText]);
      }
      
      if (!(oWidth || oHeight)) {
        fixAttr = "tofix";
      }
      else if (oWidth && !oHeight) {
        obj.iloFixSH = true;
        obj.height = parseInt(oWidth / 0.668, 10);
      } else if (!oWidth && oHeight) {
        obj.iloFixSW = true;
        obj.width = parseInt(oHeight * 0.668, 10);
      }
    }
    
    this.changeNodeAttr(obj, "setAttribute", ["ilo-ph-fix", fixAttr]);
    
    return REJECT;
  },
  
  passObj: function ILO_passObj(obj) {
    if (obj.hasAttribute("ilo-ph-fix")) {
      this.changeNodeAttr(obj, "removeAttribute", ["ilo-ph-fix"]);
      
      if (obj.iloFixSH) {
        obj.iloFixSH = null;
        this.changeNodeAttr(obj, "removeAttribute", ["height"]);
      } else if (obj.iloFixSW) {
        obj.iloFixSW = null;
        this.changeNodeAttr(obj, "removeAttribute", ["width"]);
      }
    }
    
    return ACCEPT;
  },
  
  isThirdPartyHost: function ILO_isThirdPartyHost(aHostA, aHostB) {
    if (aHostA == aHostB)
      return false;
    
    if (aHostA && aHostB) {
      try {
        return Services.eTLD.getBaseDomainFromHost(aHostA) !=
               Services.eTLD.getBaseDomainFromHost(aHostB);
      } catch(e) {}
    }
    
    return true;
  },
  
  removeCacheEntry: function ILO_removeCacheEntry(aURL) {
    this.cacheSessions.forEach(function(aCacheSession) {
      try {
        aCacheSession.asyncOpenURI(makeURI(aURL), "", Ci.nsICacheStorage.OPEN_READONLY, 
					{
						onCacheEntryCheck: function (entry, appcache) {
							return Ci.nsICacheEntryOpenCallback.ENTRY_WANTED;
						},
						onCacheEntryAvailable: function (entry, isnew, appcache, status) {
							if (entry) entry.asyncDoom(null);
        }
					});
      } catch(e) {}
    });
    
    try {
      const imgCache = Cc["@mozilla.org/image/cache;1"].getService(Ci.imgICache);
      imgCache.removeEntry(Services.io.newURI(aURL, null, null));
    } catch(e) {}
  },
  
  checkUrlInCache: function ILO_checkUrlInCache(url, docpolicy) {
    let expired = true;
    
    let forcedExpTime = this.settings.expiration_time;
    let timenow = parseInt(Date.now() / 1000 - 1, 10);
    
    let cacheEntryDescriptor;
    
    if (forcedExpTime > 0) {
      for each (let cacheSession in this.cacheSessions) {
        try {
          cacheEntryDescriptor = syncGetCacheEntry(cacheSession, url).descriptor;
        } catch(e) {}
        
        if (cacheEntryDescriptor) {
          if (cacheEntryDescriptor.lastModified) {
            let expirationTime = cacheEntryDescriptor.lastModified + forcedExpTime;
            
            if (expirationTime < timenow) { // || !cacheEntryDescriptor.dataSize(?)) {
              cacheEntryDescriptor.asyncDoom(null);
            } else {
              expired = false;
              
              if (cacheEntryDescriptor.expirationTime != expirationTime) {
                cacheEntryDescriptor.setExpirationTime(expirationTime);
              }
            }
          }
          
          if (!expired) {
            try {
              // Need to call this after setExpirationTime for properly expiration time.
              syncGetCacheEntry(cacheSession, url);
            } catch(ex) {
              expired = true;
            }
          }
          
          break; // for each
        }
      }
    
    } else if (docpolicy == 3) {
      for each (let cacheSession in this.cacheSessions) {
        try {
          cacheEntryDescriptor = syncGetCacheEntry(cacheSession, url).descriptor;
        } catch(e) {}
        
        if (cacheEntryDescriptor) {
          if (cacheEntryDescriptor.expirationTime > timenow)
            expired = false;
          
          
          break; // for each
        }
      }
    }
    
    return expired;
  },
  
  getPolicyFromFilters: function ILO_getPolicyFromFilters(aDocLocation, aURL) {
    let policy;
    
    this.policyPatternsArray.some(function(pattern) {
      return (pattern[0].test(aDocLocation) || pattern[0].test(aURL)) ?
                 (policy = pattern[1], true) :
                 false;
    });
    
    return policy;
  },
  
  _policyPatternsArray: null,
  
  get policyPatternsArray() {
    if (this._policyPatternsArray === null) {
      let result = [];
      let str2RegExp = this.str2RegExp;
      
      let patternsString = this.settings.policy_patterns || "";
      
      patternsString.split("  ").forEach(function(str) {
        let [pattern, policy] = str.split(" ");
        
        if (pattern && policy) {
          policy = parseInt(policy[0], 10);
          if (policy >= 1 && policy <= 4)
            result.push([str2RegExp(pattern), policy]);
        }
      });
      
      this._policyPatternsArray = result;
    }
    
    return this._policyPatternsArray;
  },
  
  set policyPatternsArray(aValue) {
    this._policyPatternsArray = aValue;
  },
  
  str2RegExp: function ILO_str2RegExp(aStr) {
    let res = "";
    
    // not simple; return power
    if (aStr[0] == "/" && aStr[2]) {
      let mod = "";
      
      let strEnd = aStr.substr(aStr.length - 2, aStr.length);
      if (strEnd == "/i" || strEnd == "/I") {
        mod = "i";
        res = aStr.substr(1, aStr.length - 3);
      } else if (strEnd[1] == "/") {
        res = aStr.substr(1, aStr.length - 2);
      }
      
      try {
        return new RegExp(res, mod);
      } catch(e) {}
    }
    
    // else: simple;
    res = aStr.replace(/^[\*]*(.(?:[^\*]|[\*]+[^\*])*)[\*]*$/, "$1")
              .replace(/[\*]+/, "*")
              .replace(/([^\w\*])/g, "\\$1")
              .replace(/\*/g, ".*") + "(?:\\n)?";
    
    return new RegExp(res, "i");
  },

  /**
   * log/dump
   */
  log: function ILO_log(msg) {
    if (!this.debug)
      return;
    
    msg = "[ILODebugMessage]: " + msg + "\n";
    Services.console.logStringMessage(msg);
    dump(msg);
  },
  
  dump: function ILO_dump(aObject) {
    if (!this.debug)
      return;
    
    let dumpTxt = "Dump properties in Object\r\n===============================================\r\n";
    for (let prop in aObject)
      try { dumpTxt += prop + ": " + aObject[prop] + "\r\n"; } catch(e) {}
    
    this. log(dumpTxt);
  },
  
  dumpObjectInterfaces: function ILO_dumpObjectInterfaces(aObject) {
    if (!this.debug)
      return;
    
    let result = [];
    if (aObject) {
      for each (let iface in Ci) {
        try {
          aObject.QueryInterface(Ci[iface]);
          result.push(iface);
        } catch(e) {}
      }
    }
    
    this. log(result.length ? ["\r\n=== [ object interfaces ] ===\r\n"] + result.join("\r\n") : "[no interfaces]");
  }
}

var NSGetFactory = XPCOMUtils.generateNSGetFactory([nsImgLikeOpera]);

this.__defineGetter__("gILO", function gILOGetter() {
  delete this.gILO;
  return this.gILO = Cc["@mozilla.org/imglikeopera;1"].getService().wrappedJSObject;
});
