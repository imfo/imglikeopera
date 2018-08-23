"use strict";

var EXPORTED_SYMBOLS = ["FileUtils"];

const {
  classes: Cc,
  interfaces: Ci,
  results: Cr,
  utils: Cu
} = Components;

var FileUtils = {
  CHROME_APP_PATH: "chrome://imglikeopera/",
  
  PERMS_FILE: parseInt("0644", 8),
  //PERMS_DIRECTORY: parseInt("0755", 8),
  
  writeFile: function FileUtils_writeFile(aFile, aData) {
    let stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
    try {
      stream.init(aFile, 0x02 | 0x08 | 0x20, this.PERMS_FILE, 0);
      let writer = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
      try {
        writer.init(stream, "UTF-8", 0, 0x0000);
        writer.writeString(aData);
      } catch (ex) {
        Cu.reportError(ex);
      } finally {
        writer.close();
      }
    } catch (ex) {
      Cu.reportError(ex);
    } finally {
      stream.close();
    }
  },
  
  readFile: function FileUtils_readFile(aSource, aBinaryMode) {
    if (!aSource)
      return null;

    let inputStream;
    let content = "";

    if (typeof aSource == "string") {
      aSource = aSource.replace(/^\$(content|locale|skin)\//, this.CHROME_APP_PATH + "$1/")
                       .replace(/^\$chrome\//, this.CHROME_APP_PATH);

      let chromeReg = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);

      let chromeURI;

      let uri = this.makeURI(aSource);

      try {
        chromeURI = chromeReg.convertChromeURL(uri);
      } catch (ex) {}
      
      if (chromeURI) {
        switch (chromeURI.scheme) {
          case "jar":
            chromeURI.QueryInterface(Ci.nsIJARURI);

            let fileURI = chromeURI.JARFile;
            fileURI.QueryInterface(Ci.nsIFileURL);

            let chromeFile = fileURI.file;
            let jarEntry = chromeURI.JAREntry;

            let zipreader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
            zipreader.open(chromeFile);

            if (zipreader.hasEntry(jarEntry))
              inputStream = zipreader.getInputStream(jarEntry);

            zipreader.close();

            break;

          case "file":
            let protocolHandler = Cc["@mozilla.org/network/protocol;1?name=file"].createInstance(Ci.nsIFileProtocolHandler);
            aSource = protocolHandler.getFileFromURLSpec(chromeURI.spec);
            break;

          //case "resource":
          default:
            throw new Error("'" + chromeURI.scheme + "' not yet impl");
            break;

        }
      }
    }

    if (!inputStream && (aSource instanceof Ci.nsILocalFile)) {
      inputStream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
      inputStream.init(aSource, 0x01, 0, inputStream.CLOSE_ON_EOF);
    }

    if (inputStream) {
      content = aBinaryMode ? this._getBytesFromStream(inputStream)
                            : this._getStringFromStream(inputStream);
      inputStream.close();
    }

    return content;
  },
  
  makeURI: function FileUtils_makeURI(aURLSpec, aCharset) {
    try {
      return this.ioService.newURI(aURLSpec, aCharset, null);
    } catch(e) {}

    return null;
  },
  
  get ioService() {
    delete this.ioService;
    return this.ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  },
  
  _getBytesFromStream: function FileUtils__getBytesFromStream(aInputStream) {
    let byteArray = null;

    try {
      let binaryStream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
      binaryStream.setInputStream(aInputStream);
      byteArray = binaryStream.readByteArray(binaryStream.available());
      binaryStream.close();
    } catch (ex) {
      Cu.reportError(ex);
    }

    return byteArray;
  },

  _getStringFromStream: function FileUtils__getStringFromStream(aInputStream) {
    let content = "";

    try {
      let fileSize = aInputStream.available();
      let cvstream = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
      cvstream.init(aInputStream, "UTF-8", fileSize, Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);
      let data = {};
      cvstream.readString(fileSize, data);
      content = data.value;
      cvstream.close();
    } catch (ex) {
      Cu.reportError(ex);
    }

    return content;
  }
}
