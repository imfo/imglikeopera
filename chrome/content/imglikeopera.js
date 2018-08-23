/* ***** <NB> *****
 *
 * Огромнейшее человеческое спасибо:
 *      - Владимиру Паланту (http://xpoint.ru/forums/thread.xhtml?id=27554, http://adblockplus.org);
 *      - Авторам FlashBlock (http://flashblock.mozdev.org/).
 *
 * А так же:
 *      - Разработчикам Mozilla за предоставленную возможность
 *        порезвиться с js. Хотя лучше бы я просто поспал.
 *        (https://bugzilla.mozilla.org/show_bug.cgi?id=47475)
 *
 * Ну и
 *      "Всем тем, кто отдал свою душу Ветру..."
 *
 * ***** </NB> ***** */

/* ***** <Policy values> *****
 *
 * 1 -- Load all images
 * 2 -- Load images for this site only
 * 3 -- Load cached images only
 * 4 -- Don't load images
 *
 * ***** </Policy values> ***** */

"use strict";

var ILO = {
  get browser() {
    delete this.browser;
    return this.browser = getBrowser();
  },
  
  get ImgLikeOpera() {
    delete this.ImgLikeOpera;
    return this.ImgLikeOpera = Cc["@mozilla.org/imglikeopera;1"].getService().wrappedJSObject;
  },
  
  get Preferences() {
    delete this.Preferences;
    Cu.import("resource://imglikeopera-modules/Preferences.jsm", this);
    return this.Preferences;
  },
  
  /************************************************************************
   *
   * Get selected tab and document
   *
   ************************************************************************/
  getTabAndDoc: function ILO_getTabAndDoc(aTab) {
    let tab = aTab || this.browser.selectedBrowser;
    
    let doc = tab.contentDocument.defaultView.document;
    if (!doc.iloData)
      doc.iloData = this.ImgLikeOpera.setupDocData(tab);
    
    return [tab, doc];
  },
  
  /************************************************************************
   *
   * XPath helpers
   *
   ************************************************************************/
  getXPathResult: function ILO_getXPathResult(aDocument, aExpression) {
    let xpe = new XPathEvaluator();
    let nsResolver = xpe.createNSResolver(aDocument.documentElement);
    return xpe.evaluate(aExpression, aDocument, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  },
  
  forEachXPathResult: function ILO_forEachXPathResult(aDocument, aExpression, aFunction) {
    let result = this.getXPathResult(aDocument, aExpression);
    for (let i = result.snapshotLength; --i >= 0;)
      aFunction(result.snapshotItem(i));
  },
  
  /************************************************************************
   *
   * Page indicator (bottom-right-button): popup, click
   *
   ************************************************************************/
  
  /** **************************** **
   **  2do, 2do, 2do...
   ** **************************** **/
  
  get button() {
    return document.getElementById("ilo-toolbar-button");
  },
  
  checkToolbarbuttonClick: function ILO_checkToolbarbuttonClick(aEvent) {
    let node = aEvent.target;
    
    if (node.localName == "toolbarbutton") {
      if (aEvent.button == 1)
        this.openPrefWindow();
      else if (aEvent.button == 2)
        this.indicatorClick("prev");
    }
  },
  
  closeMenus: function ILO_closeMenus(node) {
    if ("tagName" in node) {
      if (node.namespaceURI == "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"
          && (node.tagName == "menupopup" || node.tagName == "popup"))
        node.hidePopup();
      
      this.closeMenus(node.parentNode);
    }
  },
  
  openPrefWindow: function ILO_openPrefWindow() {
    const winType = "ILO:Preferences";
    const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    
    let prefWindow = wm.getMostRecentWindow(winType);
    
    if (prefWindow) {
      prefWindow.focus();
    } else {
      let chromePath = "chrome://imglikeopera/content/preferences/preferences.xul";
      let instantApply = this.Preferences.get("browser.preferences.instantApply", false);
      let features = ["chrome,titlebar,toolbar,centerscreen", (instantApply ? "dialog=no" : "modal")];
      
      let resizable = (typeof aResizable == "boolean") ? aResizable : true;
      if (resizable)
        features.push("resizable");
      
      prefWindow = window.openDialog(chromePath, winType, features.join(","));
    }
    
    return prefWindow;
  },
  
  indicatorClick: function ILO_indicatorClick(policy) {
    if (policy == "settings")
      return this.openPrefWindow();
    
    let [tab, doc] = this.getTabAndDoc();
    
    if (policy == "next" || policy == "prev") {
      let modes = this.ImgLikeOpera.policySwitchModes;
      let currIndex = modes.indexOf(+tab.iloTabPolicy);
      if (currIndex == -1)
        currIndex = 0;
      
      if (policy == "next") {
        // left-mouse-click
        currIndex--;
        if (currIndex == -1)
          currIndex = modes.length - 1;
        policy = modes[currIndex];
      } else {
        // right-mouse-click
        currIndex++;
        if (currIndex >= modes.length)
          currIndex = 0;
        policy = modes[currIndex];
      }
    }
    
    policy -= 0;
    
    if (policy != tab.iloTabPolicy) {
      tab.iloTabPolicy = doc.iloData.policy = policy;
      doc.iloData.clearURLStatus();
      
      this.indicatorSet(policy);
      
      if (policy != 4)
        this.refreshPageObjects(doc);
    }
    
    return true;
  },

  indicatorPopup: function ILO_indicatorPopup() {
    let button = this.button;
    if (!button)
      return;
    
    let selectedIndex = 4 - this.browser.selectedBrowser.iloTabPolicy;
    button.lastChild.children[selectedIndex].setAttribute("checked", "true");
  },
  
  indicatorSet: function ILO_indicatorSet(policy) {
    this.sessionStore.setTabPolicy(this.browser.selectedTab, policy);
    
    let button = this.button;
    if (!button)
      return;
    
    button.setAttribute("value", "policy" + policy);
    
    if (button.getAttribute("label"))
      button.setAttribute("label", "ILO [" + this.strBundleManager.getString("buttonPolicy" + policy) + "]");
  },
  
  /************************************************************************
   *
   * 1) contentAreaContextMenu --> popupshowing --> ilo-context-menu-load-image
   * 2) ctrl + rigthMouseClick
   *
   ************************************************************************/
  loadImg: function ILO_loadImg(aTargets) {
    if (!aTargets)
      return;
    
    let doc = null;
    [].concat(aTargets).forEach(function(target) {
      doc = this._loadImg(target);
    }, this);
    
    if (doc)
      this.refreshPageStyles(doc);
  },
  
  _loadImg: function ILO__loadImg(obj) {
    let objsrc = obj ? obj.getAttribute("ilo-full-src") : null;// "ilo-full-src" need for inputs with type="image"
    
    if (!objsrc)
      return;
    
    let [tab, doc] = this.getTabAndDoc();
    
    doc.iloData.passURL(objsrc);
    
    // if policy == "Don't load images" ==> turn it to "Load from cache"
    if (tab.iloTabPolicy == 4) {
      tab.iloTabPolicy = doc.iloData.policy = 3;
      this.indicatorSet(3);
    }
    
    if (!obj.getAttribute("ilo-ph-fix"))
      this.ImgLikeOpera.removeCacheEntry(objsrc);
    
    this.refreshPageObjects(doc, objsrc);
    return doc;
  },
  
  /************************************************************************
   *
   * Refresh images|styles in document
   *
   ************************************************************************/
 
  getAllDocs: function ILO_getAllDocs(aFrameset) {
    let docsArray = [aFrameset.document];
    let frames = aFrameset.frames;
    
    for (let i = frames.length; --i > -1;)
      docsArray = docsArray.concat(this.getAllDocs(frames[i]));
    
    return docsArray;
  },

  refreshPageObjects: function ILO_refreshPageObjects(doc, objsrc) {
    if (doc.iloData.delayPolicy)
      doc.iloData.delayPolicy = null;
    
    this.getAllDocs(doc.defaultView).forEach(function(aDoc) {
      this.refreshObjectsInFrame(aDoc, objsrc);
      
      if (!objsrc)
        this.refreshStyles(aDoc);
    }, this);
  },
  
  refreshPageStyles: function ILO_refreshPageStyles(doc) {
    if (doc.iloData.delayPolicy)
      doc.iloData.delayPolicy = null;
    
    this.getAllDocs(doc.defaultView).forEach(function(aDoc) {
      this.refreshStyles(aDoc);
    }, this);
  },
  
  refreshObjectsInFrame: function ILO_refreshObjectsInFrame(doc, objsrc) {
    this.forEachXPathResult(doc,
      
      "//*" + (objsrc ? "[@ilo-full-src='" + objsrc + "']" : "[@ilo-ph-fix]"),
      
      function(aObject) {
        objsrc ?
          aObject.setAttribute("ilo-ph-fix", "mustLoad") :
          aObject.removeAttribute("ilo-ph-fix");
        
        if (aObject.hasAttribute("src")) {
          aObject.setAttribute("src", aObject.getAttribute("src"));
        }
        else if (aObject.hasAttribute("data")) {
          let dbl = aObject.cloneNode(true),
              parent = aObject.parentNode;
          
          parent.insertBefore(dbl, aObject);
          parent.removeChild(aObject);
        }
      }
    );
  },
  
  refreshCssRules: function ILO_refreshCssRules(aSheet) {
    let cssRules = null;
    
    try {
      cssRules = aSheet.cssRules;
    } catch(e) {}
    
    if (!(cssRules && cssRules.length))
      return;
    
    let cssRule;
    let i = 0;
    
    while (( cssRule = cssRules.item(i++) )) {
      if (cssRule.styleSheet)
        this.refreshCssRules(cssRule.styleSheet);
      else {
        let style = cssRule.style;
        let cssText = cssRule.cssText;
        
        if (style && cssText) {
          if (/background.*url/.test(cssText))
            style.backgroundImage = style.backgroundImage;
          
          if (/list\-style.*url/.test(cssText))
            style.listStyleImage = style.listStyleImage;
          
          if (/content:/.test(cssText))
            style.content = style.content;
        }
      }
    }
  },
  
  refreshStyles: function ILO_refreshStyles(doc) {
    // inline styles
    this.forEachXPathResult(doc,
      
      "//*[contains(@style,'url')]",
      
      function(aObject) {
        aObject.style.backgroundImage = aObject.style.backgroundImage;
      }
    );
    
    this.forEachXPathResult(doc,
      
      "//*[@background]",
      
      function(aObject) {
        aObject.setAttribute("style",
            "background-image:url('" + aObject.getAttribute("background") + "'); " +
            (aObject.getAttribute("style") || ""));
        aObject.removeAttribute("background");
      }
    );
    
    // <link>, <style>, <xml-stylesheet>
    let docStyleSheets = doc.styleSheets;
    let styleSheet;
    let i = 0;
    
    while (( styleSheet = docStyleSheets.item(i++) )) {
      if (/^$|all|screen|projection/.test(styleSheet.media.mediaText)) {
        let styleSheetNode = styleSheet.ownerNode;
        
        // styleSheetNode.nodeName.toLowerCase() = "style"||"link"||"xml-stylesheet"
        //    if "style"-node: test for inline @import rules,
        //    like @import url("http://example.com/example.css")
        if (styleSheetNode.nodeName.toLowerCase() == "style" && !/@import/.test(styleSheetNode.textContent))
          styleSheetNode.textContent = styleSheetNode.textContent; // ...more simple and fast then other method
        else
          this.refreshCssRules(styleSheet);
      }
    }
  },
  
  onLoad: function ILO_onLoad() {
    window.removeEventListener("load", this.onLoad, true);
    
    this.ImgLikeOpera.onChromeWindowLoad(window);
    
    this.sessionStore = this.ImgLikeOpera.sessionStore;
    this.settings = this.ImgLikeOpera.settings;
    this.strBundleManager = this.ImgLikeOpera.strBundleManager;
    
    let defPolicy = this.settings.policy_default;
    if (this.settings.policy_inherit) {
      // "From previous window/tab" setting
      try {
        let openerPolicy = window.opener.ILO.browser.selectedBrowser.iloTabPolicy;
        if (openerPolicy)
          defPolicy = openerPolicy;
      } catch(e) {}
    }
    
    // Current tab policy
    this.browser.selectedBrowser.iloTabPolicy = defPolicy;
    
    // Page-indicator.
    this.indicatorSet(defPolicy);
    
    // Tabs open and switching.
    this.browser.tabContainer.addEventListener("TabOpen", this, false);
    this.browser.tabContainer.addEventListener("select", this, true);
    
    // Context Menu: + "Load Image".
    document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", this, false);
    
    // Ctrl+RClick for image load
    window.addEventListener("mousedown", this, false);
    
    // "Esc" key
    window.addEventListener("keypress", this, false);
    
    // SessionStore
    window.addEventListener("SSTabRestoring", this, false);
    
    // For work with Tab Mix Plus we need this lines:
    if (typeof TabmixSessionData == "object" && this.settings.exts_tabmix_sessiondata) {
      let origGetTabProperties = TabmixSessionData.getTabProperties;
      TabmixSessionData.getTabProperties = function(aTab, checkPref) {
        let res = origGetTabProperties.apply(this, arguments);
        res += " ilopolicy=" + parseInt(gBrowser.getBrowserForTab(aTab).iloTabPolicy, 10);
        return res;
      }
      
      let origSetTabProperties = TabmixSessionData.setTabProperties;
      TabmixSessionData.setTabProperties = function(aTab, tabProperties, checkPref) {
        let browser = gBrowser.getBrowserForTab(aTab);
        
        if (browser) {
          let policyValue = tabProperties.match(/ ilopolicy=(\d)/);
          
          if (policyValue && policyValue[1])
            browser.iloTabPolicy = parseInt(policyValue[1], 10) || browser.iloTabPolicy;
          
          if (gBrowser.selectedBrowser == browser)
            ILO.indicatorSet(browser.iloTabPolicy);
        }
        
        return origSetTabProperties.apply(this, arguments);
      }
      
      let origIndicatorClick = ILO.indicatorClick;
      ILO.indicatorClick = function() {
        let res = origIndicatorClick.apply(this, arguments);
        
        if (typeof TabmixSessionData == "object")
          TabmixSessionManager.updateTabProp(this.browser.selectedTab);
        
        return res;
      }
    }
  },
  
  unLoad: function ILO_unLoad() {
    // FIXME: remove other listeners
    
    window.removeEventListener("SSTabRestoring", this, false);
    
    this.browser.tabContainer.removeEventListener("TabOpen", this, false);
    this.browser.tabContainer.removeEventListener("select", this, true);
    window.removeEventListener("mousedown", this, false);
    window.removeEventListener("keypress", this, false);
    document.getElementById("contentAreaContextMenu").removeEventListener("popupshowing", this, false);
    
    this.strBundleManager = null;
    this.settings = null;
    this.sessionStore = null;
  },
  
  // Ctrl+RClick (last mousedown event data)
  _lastMouseDownEventData: [],
  
  handleEvent: function ILO_handleEvent(aEvent) {
    if (!aEvent.isTrusted)
      return;
    
    switch (aEvent.type) {
      // on tab select
      case "select": {
        let [tab, doc] = this.getTabAndDoc();
        
        doc.iloData.clearURLStatus();
        
        if (this.settings.tabs_refresh)
          this.refreshPageObjects(doc);
        
        this.indicatorSet(tab.iloTabPolicy);
        
        break;
      }
      
      case "TabOpen": {
        let policy = this.settings.policy_inherit
                         ? this.browser.selectedBrowser.iloTabPolicy
                         : this.settings.policy_default;
        
        aEvent.target.linkedBrowser.iloTabPolicy = policy;
        
        break;
      }
      
      // gContextMenu 'popupshowing'
      case "popupshowing": {
        let [mdTS, mdSX, mdSY] = this._lastMouseDownEventData;
        if (mdTS && (Date.now() - mdTS < 1000) && mdSX == aEvent.screenX && mdSY == aEvent.screenY)
          aEvent.preventDefault();
        
        document.getElementById("ilo-context-menu-load-image").hidden = !this.getImageFromTarget(gContextMenu.target);
        break;
      }
      
      // Ctrl+RClick
      case "mousedown": {
        this._lastMouseDownEventData = [];
        
        if (aEvent.button == 2 && aEvent.ctrlKey && !(aEvent.shiftKey || aEvent.altKey)) {
          let targets = this.getImagesFromPoint(aEvent.target, aEvent.clientX, aEvent.clientY)
                            .concat(this.getImagesFromSelection());
          
          if (targets.length) {
            this.loadImg(targets);
            this._lastMouseDownEventData = [Date.now(), aEvent.screenX, aEvent.screenY];
          }
        }
        break;
      }
      
      case "keypress": {
        if (aEvent.keyCode == 27 && this.settings.esc_key) { // "Esc"
          let _doc = aEvent.target.ownerDocument;
          while (_doc.defaultView.frameElement)
            _doc = _doc.defaultView.frameElement.ownerDocument;
          
          let [tab, doc] = this.getTabAndDoc();
          
          if (_doc != doc)
            return;
          
          let docShell = tab.docShell;
          docShell["allowImages"] = !docShell["allowImages"];
          docShell["allowImages"] = !docShell["allowImages"];
          // docShell["allowPlugins"] for active content?!
        }
        break;
      }
      
      case "delayLoadRefresher": {
        let doc = aEvent.target;
        if (doc.iloData.delayPolicy) {
          doc.iloData.delayPolicy = null;
          this.refreshPageObjects(doc);
        }
        break;
      }
      
      // tab restoring
      case "SSTabRestoring": {
        let tab = aEvent.originalTarget;
        let policy = this.sessionStore.getTabPolicy(tab);
        
        if (policy) {
          gBrowser.getBrowserForTab(tab).iloTabPolicy = policy;
          if (tab == gBrowser.selectedTab)
            this.indicatorSet(policy);
        }
        break;
      }
      
      default:
        break;
    }
  },
  
  getImagesFromSelection: function ILO_getImagesFromSelection() {
    let selection = window.content.getSelection();
    if (selection.isCollapsed)
      return [];
    
    let images = [];
    let imagesHash = {};
    
    let [, doc] = this.getTabAndDoc();
    
    this.forEachXPathResult(doc,
      
      "//*[@ilo-ph-fix]",
      
      function(aNode) {
        let nodeSrc = aNode.getAttribute("ilo-full-src");
        if (nodeSrc && !imagesHash[nodeSrc] && selection.containsNode(aNode, false)) {
          imagesHash[nodeSrc] = true;
          images.push(aNode);
        }
      }
    );
    
    return images;
  },
  
  getImagesFromPoint: function ILO_getImagesFromPoint(aTarget, aClientX, aClientY) {
    let ownerDoc = aTarget.ownerDocument;
    
    let images = [];
    let imageFromPoint;
    let hiddenElements = [];
    let elementFromPoint;
    let i = 0;
    
    while (i++ < 3 && (elementFromPoint = ownerDoc.elementFromPoint(aClientX, aClientY))) {
      if ((imageFromPoint = this.getImageFromTarget(elementFromPoint)))
        images.push(imageFromPoint);
      
      elementFromPoint.style.visibility = "hidden";
      hiddenElements.push(elementFromPoint);
    }
    
    hiddenElements.forEach(function(aElement) {
      aElement.style.visibility = "visible";
    });
    
    return images;
  },
  
  getImageFromTarget: function ILO_getImageFromTarget(aTarget) {
    if (!aTarget)
      return null;
    
    if (aTarget instanceof Ci.nsIImageLoadingContent)
      return aTarget.getAttribute("ilo-full-src") ? aTarget : null;
    
    // check AREA/MAP image
    if ("tagName" in aTarget && aTarget.tagName == "AREA") {
      let map = aTarget.parentNode;
      if (map.tagName == "MAP" && map.name)
        return this.getImageFromTarget(this.getXPathResult(aTarget.ownerDocument,
                                   "//img[@usemap='#" + map.name + "']")
                                   .snapshotItem(0));
    }
    
    return null;
  },
  
  log: function ILO_log(msg) {
    this.ImgLikeOpera. log(msg);
  },
  
  dump: function ILO_dump(aObject) {
    this.ImgLikeOpera. dump(aObject);
  }
};

window.addEventListener("load", function(){ILO.onLoad();}, false);
window.addEventListener("unload", function(){ILO.unLoad();}, false);
window.addEventListener("delayLoadRefresher", ILO, false);
