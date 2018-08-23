
/* TODO: refact */
const Filters = {
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
  
  _started: false,
  
  startup: function() {
    if (this._started)
      return;
    
    this._started = true;
    
    this.rAddFilter = document.getElementById("iloAddFilter");
    this.rAddPolicy = document.getElementById("iloAddPolicy");
    this.rTree =      document.getElementById("iloPermissionsTree");
    this.rTreeCh =    document.getElementById("iloPermissionsTreeChildren");
    this.rButtons =   document.getElementById("iloPermButtons").childNodes;
    this.rPopup =     document.getElementById("iloFiltersPopup").childNodes;
    
    let policyPatternsData = (this.settings.policy_patterns || []).toString().split("  ");
    for (let i = 0, len = policyPatternsData.length - 1; i < len; i++)
      this.treeAddItem(policyPatternsData[i].split(" "));
  },
  
  shutdown: function() {
    if (!this._started)
      return;
    
    this._started = false;
  },
  
  save: function() {
    if (!this._started)
      return;
    
    this.settings.policy_patterns = this.treeMakePattern();
  },
  
  // Fill filters tree.
  fillFiltersList: function(patterns, overwriteCurrentList) {
    if (overwriteCurrentList)
      this.removeFilter("all");
    
    for (let i = 0, len = patterns.length; i < len; i++) {
      let patt = patterns[i].split(" ");
      patt[1] = patt[1][0];
      
      if (patt.length == 2 && patt[1] > 0 && patt[1] < 5)
        this.treeAddItem(patt);
    }
  },
  
  // Imports filters from disc.
  filtersImportList: function() {
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(window, this.strBundleManager.getString("importexportFilters"), fp.modeOpen);
    fp.appendFilters(fp.filterText);
    
    if (fp.show() == fp.returnCancel)
      return;
    
    let stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
    let streamIO = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
    
    stream.init(fp.file, 0x01, parseInt("0444", 8), null);
    streamIO.init(stream);
    
    let input = streamIO.read(stream.available());
    
    streamIO.close();
    stream.close();
    
    // unix + mac + dos environment-compatible
    // first: whole match -- second: backref-1 -- etc..
    let linebreak = input.match(/(?:\[ImgLikeOpera\])(((\n+)|(\r+))+)/m)[1];
    
    let inputArray = input.split(linebreak);
    
    let headerRe = /\[ImgLikeOpera\]/; // tests if the first line is ILO's header
    if (headerRe.test(inputArray[0])) {
      inputArray.shift();
      let overwriteCurrentList = confirm(this.strBundleManager.getString("overwriteCurrentListConfirm"));
      this.fillFiltersList(inputArray, overwriteCurrentList);
    }
    else {
      alert(this.strBundleManager.getString("fileNotValid"));
    }
  },
  
  // Exports the current list of filters to a file on disc.
  filtersExportList: function() {
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    let stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
    
    fp.init(window, this.strBundleManager.getString("importexportFilters"), fp.modeSave);
    fp.appendFilters(fp.filterText);
    
    if (fp.show() != fp.returnCancel) {
      if (fp.file.exists())
        fp.file.remove(true);
      
      fp.file.create(fp.file.NORMAL_FILE_TYPE, parseInt("0755", 8));
      
      stream.init(fp.file, 0x02, 0x200, null);
      stream.write("[ImgLikeOpera]\n", 15);
      
      let patterns = this.treeMakePattern().split("  ");
      
      for (let i = 0, len = patterns.length; i < len - 1; i++)
        stream.write(patterns[i]+"\n", patterns[i].length + 1);
      
      stream.close();
    }
  },
  
  checkEvent: function(e) {
    // FIXME: check current pane
    //if (document.getElementById("iloSettingsTab2").parentNode.selectedIndex != 1)
      //return;
    
    if (e == "copy") {
      let rowText = this.getRowData();
      if (!rowText) return;
      
      this.rAddFilter.value = rowText[0];
      this.rAddPolicy.selectedIndex = 4 - rowText[1];
      
      return;
    }
    
    if (e == "modify") {
      let rowText = this.getRowData();
      if (!rowText) return;
      
      let rv = { rv: null };
      
      openDialog("chrome://imglikeopera/content/preferences/filters-dialog.xul",
                 "_blank", "chrome,dependent,modal", rowText, rv);
      
      if (rv.rv) {
        this.removeFilter();
        rowText[2] -= -1;
        this.treeAddItem(rv.rv, rowText[2]);
      }
      
      return;
    }
    
    if (e == "selectAll")
      return this.rTree.view.selection.selectAll();
    
    if (e == "removeFilters") {
      if (this.rButtons[4].disabled) return;
      
      if (confirm(this.strBundleManager.getString("removeSelectedFilters")+"?"))
        this.removeFilter();
      
      return;
    }
    
    if (e == "removeAllFilters") {
      if (this.rButtons[5].disabled) return;
      
      if (confirm(this.strBundleManager.getString("removeAllFilters")+"?"))
        this.removeFilter("all");
      
      return;
    }
    
    let i = (e == "top" || e == "up") ? 0 : 2;
    if (this.rButtons[i].getAttribute("disabled") == "true")
      return;
    
    this.filterSetPriority(e);
  },
  
  treeAddItem: function (items, indx) {
    let tri = document.createElement("treeitem");
    let trr = document.createElement("treerow");
    let trc1 = document.createElement("treecell");
    let trc2 = document.createElement("treecell");
    let trc3 = document.createElement("treecell");
    
    // RegExp test
    let txt = items[0].replace(/[\s]*/g, "");
    if (txt[0] == "/" && txt[2]) {
      let mod = "";
      let res = "";
      let txtEnd = txt.substr(txt.length - 2, txt.length);
      
      if (txtEnd == "/i" || txtEnd == "/I") {
        mod = "i"; 
        res = txt.substr(1, txt.length-3);
      } else if (txtEnd[1] == "/") {
        res = txt.substr(1, txt.length-2);
      }
      
      try {
        let reg = new RegExp(res, mod);
        trc1.setAttribute("label", "R");
      } catch(e) {}
    }
    
    trc2.setAttribute("label", txt);
    trc3.setAttribute("label", items[1]);
    trr.appendChild(trc1);
    trr.appendChild(trc2);
    trr.appendChild(trc3);
    tri.appendChild(trr);
    
    if (!indx)
      return this.rTreeCh.appendChild(tri);
    
    indx--;
    this.rTreeCh.insertBefore(tri, this.rTreeCh.childNodes[indx] || null);
    this.rTree.view.selection.select(indx);
  },
  
  treeMakePattern: function() {
    let pattern = "";
    let rTreeChChildren = this.rTreeCh.childNodes;
    let iCount = rTreeChChildren.length;
    
    for (let i = 0; i < iCount; i++) {
      let item = rTreeChChildren[i].childNodes[0];
      pattern += item.childNodes[1].getAttribute("label") +
                   " " + item.childNodes[2].getAttribute("label") + "  ";
    }
    
    return pattern;
  },
  
  getTreeSelections: function() {
    let selections = [];
    let select = this.rTree.view.selection;
    if (select) {
      let count = select.getRangeCount();
      let min = {};
      let max = {};
      for (let i = 0; i < count; i++) {
        select.getRangeAt(i, min, max);
        for (let k = min.value; k <= max.value; k++)
          if (k != -1) selections[selections.length] = k;
      }
    }
    return selections;
  },

  buttonsDisabled: function(status) {
    for (let i = 0; i < 6; i++)
      this.rButtons[i].setAttribute("disabled", status[i]);
    for (let i = 3; i < 7; i++)
      this.rPopup[i].setAttribute("disabled", status[i-3]);
  },
  
  topBottomButtonStatusTest: function(selections) {
    for (let i = selections.length; --i > 0;)
      if (selections[i]-selections[i-1] != 1)
        return "false";
    
    return "true";
  },
  
  permissionSelected: function() {
    let selections = this.getTreeSelections();
    let buttonsStatus = [];
    
    if (selections[0] == 0) {
      if (selections.length == 1) buttonsStatus.push("true");
      else buttonsStatus.push(this.topBottomButtonStatusTest(selections));
      
      buttonsStatus.push("true");
    } else {
      buttonsStatus.push("false","false");
    }
    
    if (selections[selections.length-1]+1 == this.rTreeCh.childNodes.length) {
      buttonsStatus.push("true");
      
      if (selections.length == 1) buttonsStatus.push("true");
      else buttonsStatus.push(this.topBottomButtonStatusTest(selections));
    } else {
      buttonsStatus.push("false","false");
    }
    
    if (selections.length != 0) buttonsStatus.push("false");
    else buttonsStatus.push("true");
    
    this.buttonsDisabled(buttonsStatus);
  },

  removeFilter: function(all) {
    if (all)
      this.rTree.view.selection.selectAll();
    
    let selections = this.getTreeSelections();
    
    for (let s = selections.length-1; s >= 0; s--)
      this.rTreeCh.removeChild(this.rTreeCh.childNodes[selections[s]]);
    
    let bAll = this.rTreeCh.childNodes.length == 0 ? "true" : "false";
    this.buttonsDisabled([ "true","true","true","true","true",bAll ]);
  },
  
  filterSetPriority: function(prior) {
    let selections = this.getTreeSelections();
    let deletedItems = [];
    let i, iCount;
    
    switch (prior) {
      case "up":
        iCount = selections.length;
        for (i = 0; i < iCount; i++)
          this.rTreeCh.insertBefore(this.rTreeCh.childNodes[selections[i]],
                                    this.rTreeCh.childNodes[selections[i]-1]);
        break;
      case "down":
        for (i = selections.length-1; i >= 0; i--)
          this.rTreeCh.insertBefore(this.rTreeCh.childNodes[selections[i]],
                                    this.rTreeCh.childNodes[selections[i]+2]);
        break;
      case "top":
        for (i = selections.length-1; i >= 0; i--) {
          deletedItems.push(this.rTreeCh.childNodes[selections[i]]);
          this.rTreeCh.removeChild(this.rTreeCh.childNodes[selections[i]]);
        }
        
        iCount = deletedItems.length;
        
        for (i = 0; i < iCount; i++)
          this.rTreeCh.insertBefore(deletedItems[i], this.rTreeCh.childNodes[0]);
        
        break;
      
      case "bottom":
        for (i = selections.length-1; i >= 0; i--) {
          deletedItems.push(this.rTreeCh.childNodes[selections[i]]);
          this.rTreeCh.removeChild(this.rTreeCh.childNodes[selections[i]]);
        }
        
        for (i = deletedItems.length-1; i >= 0; i--)
          this.rTreeCh.appendChild(deletedItems[i]);
        
        break;
    }
    
    this.setTreeSelections(selections, prior);
  },

  setTreeSelections: function(selections, prior) {
    let range,
        select = this.rTree.view.selection;
    
    switch (prior) {
      case "up":
        for (let s = selections.length-1; s >= 0; s--) {
          range = selections[s]-1;
          select.rangedSelect(range, range, true);
        }
        break;
      
      case "down":
        for (let s = selections.length-1; s >= 0; s--) {
          range = selections[s]+1;
          select.rangedSelect(range, range, true);
        }
        break;
      
      case "top":
        range = selections.length-1;
        select.rangedSelect(0, range, true);
        break;
      
      case "bottom":
        range = this.rTreeCh.childNodes.length;
        select.rangedSelect(range-selections.length, range-1, true);
        break;
    }
  },
  
  /**
   * Patterns adding
   **/
  addFilter: function() {
    let filter = this.rAddFilter.value.replace(/\s*/g, "");
    let policy = 4 - this.rAddPolicy.selectedIndex;
    
    if (filter == "") return;
    
    let indx = 1 + this.getTreeSelections()[0];
    if (isNaN(indx)) indx = 1;
    
    this.treeAddItem([filter, policy], indx);
  },
  
  filterEdit: function(event, click) {
    if ((event.button == 0 && click == "dblclick") ||
        (event.button == 2 && click == "rclick"))
    {
      let row = {};
      
      let b = event.originalTarget.parentNode.treeBoxObject;
      b.getCellAt(event.clientX, event.clientY, row, {}, {});
      
      if (row.value == -1)
        return event.originalTarget.removeAttribute("context");
      
      switch (click) {
        case "dblclick":
          this.checkEvent("modify");
          break;
        
        case "rclick":
          let selections = this.getTreeSelections();
          
          let disable = (selections.length != 1);
          this.rPopup[0].setAttribute("disabled", disable);
          this.rPopup[1].setAttribute("disabled", disable);
          
          event.originalTarget.setAttribute("context", "iloFiltersPopup");
          break;
      }
    }
  },

  getRowData: function() {
    let select = this.getTreeSelections();
    
    // alert("Please, give me a single row selection");
    if (select.length != 1)
      return;
    
    // return Array( filter, policy, row index )
    return [this.rTreeCh.childNodes[select[0]].childNodes[0].childNodes[1].getAttribute("label"),
            this.rTreeCh.childNodes[select[0]].childNodes[0].childNodes[2].getAttribute("label"),
            select[0]];
  }
};
