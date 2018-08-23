"use strict";

var EXPORTED_SYMBOLS = ["Settings"];

Components.utils.import("resource://imglikeopera-modules/Preferences.jsm");

/************************************************************************
 *
 * Settings.some_pref_name => Prefs.get("some.pref.name")
 *
 ************************************************************************/

/************************************************************************/

var Settings = new Proxy({}, {
  get: function SettingsProxy_get(aProxy, aName) {
    let prefName = propName2prefName(aName);
    
    if (!(aName in settingsHash))
      settingsHash[aName] = Prefs.get(prefName, null);
    
    return settingsHash[aName];
  },

  set: function SettingsProxy_set(aProxy, aName, aValue) {
    Prefs.set(propName2prefName(aName), aValue);
  },
  
  delete: function SettingsProxy_delete(aName) {
    delete settingsHash[aName];
  }
});

/************************************************************************/

let settingsHash = {__proto__: null};

let settingsObserver = {
  observe: function(aSubject, aTopic, aData) {
    if (aTopic != "nsPref:changed")
      return;
    
    let prefName = aData.split(Prefs.prefBranch)[1];
    if (prefName)
      delete settingsHash[prefName2propName(prefName)];
  }
};

// TODO: remove observer
Prefs.observe2("", settingsObserver);

/************************************************************************/

function prefName2propName(str) {return str.replace(/\./g, "_");}
function propName2prefName(str) {return str.replace(/_/g, ".");}
