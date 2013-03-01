"use strict";

let EXPORTED_SYMBOLS = ["DocumentData"];

function DocumentData(aTab, aDelay) {
  this.clearURLStatus();
  
  this._policy = aTab.iloTabPolicy;
  this._delayPolicy = null;
  
  let wnd = aTab.contentDocument.defaultView;
  wnd.document.iloData = this;
  
  if (aDelay > 0 && this.policy < 3) {
    this.delayPolicy = true;
    
    wnd.addEventListener("load",
      function() {
        this.setTimeout(function() {
          let refreshEvent = this.document.createEvent("UIEvents");
          refreshEvent.initEvent("delayLoadRefresher", true, false);
          this.document.dispatchEvent(refreshEvent);
        }, aDelay)
      },
    false);
  }
}

DocumentData.prototype = {
  URL_PASS: 1,
  URL_BLOCK: -1,
  
  clearURLStatus: function DocumentData_clearURLStatus() {
    this._ulrsData = {
      __proto__: null
    };
  },
  
  get policy() {
    return this._policy;
  },
  
  set policy(aValue) {
    this._policy = aValue;
  },
  
  get delayPolicy() {
    return this._delayPolicy;
  },
  
  set delayPolicy(aValue) {
    if (aValue == null) {
      this.policy = this._delayPolicy;
      this._delayPolicy = null;
    } else if (this._delayPolicy == null) {
      this._delayPolicy = this.policy;
      this.policy = 4;
    }
  },
  
  getURLStatus: function DocumentData_getURLStatus(aURL) {
    return aURL ? (this._ulrsData[aURL] || null) : null;
  },
  
  passURL: function DocumentData_passURL(aURL) {
    this._ulrsData[aURL] = this.URL_PASS;
  },
  
  blockURL: function DocumentData_blockURL(aURL) {
    this._ulrsData[aURL] = this.URL_BLOCK;
  }
}
