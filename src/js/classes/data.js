/* eslint-disable jquery/no-ajax */
const path = require('path');
const saveAs = require('file-saver');
import { Node } from './node';
import { Utils, FILETYPE } from './utils';

export const data = {
  editingPath: ko.observable(null),
  editingName: ko.observable('NewFile'),
  editingType: ko.observable('json'),
  editingFolder: ko.observable(null),
  isDocumentDirty: ko.observable(false),
  fileVersion: 1,
  restoreFromLocalStorage: ko.observable(true),
  lastStorageHost: ko.observable('LOCAL'), // GIST | LOCAL
  editingFileFolder: function(addSubPath = '') {
    const filePath = data.editingPath() ? data.editingPath() : '';
    return addSubPath.length > 0
      ? path.join(path.dirname(filePath), addSubPath)
      : path.dirname(filePath);
  },
  startNewFile: function(editingName = 'NewFile', editingFormat = 'json') {
    data.editingPath(null);
    data.editingName(editingName);
    data.editingType(editingFormat);
    data.editingFolder(null);
    app.workspace.selectedNodes = [];
    app.editing(null);
    app.nodes([app.newNode(true).title('Start')]);
    app.tags([]);
    app.updateNodeLinks();
    app.workspace.warpToNodeByIdx(0);
    data.lastStorageHost('LOCAL');
    data.isDocumentDirty(true);
    app.refreshWindowTitle();
    data.clearFileTags();
  },
  askForFileName: function() {
    Swal.fire({
      title: 'Enter a New File Name',
      input: 'text',
      inputPlaceholder: 'NewFile',
      showCancelButton: true,
    }).then((result) => {
      if (result.value || result.value === '') {
        data.startNewFile(result.value || 'NewFile');
      }
    });
  },
  setNewFile: function() {
    Swal.fire({
      title: 'Create a New File?',
      text: `Any unsaved progress to ${data.editingName()} will be lost!`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'New file',
      cancelButtonText: 'No, cancel!',
    }).then((result) => {
      if (result.value) {
        data.askForFileName();
      }
    });
  },
  saveAppStateToLocalStorage: function() {
    if (!data.restoreFromLocalStorage()) return;

    const storage = app.settings.storage;
    data.isDocumentDirty(true);
    app.refreshWindowTitle();
    storage.setItem(
      'appState',
      JSON.stringify({
        editingPath: data.editingPath(),
        editingName: data.editingName(),
        editingType: data.editingType(),
        editingFolder: data.editingFolder(),
        editingTitle: app.editing() ? app.editing().title() : null,
        fileTags: app.fileTags,
        nodes: data.getNodesAsObjects(),
        tags: app.tags(),
        editorSelection: app.editor ? app.editor.selection.getRange() : null,
        transform: app.workspace.transform,
        scale: app.workspace.scale,
        lastStorageHost: data.lastStorageHost(),
      }),
    );
  },
  loadAppStateFromLocalStorage: function() {
    if (!data.restoreFromLocalStorage()) return;

    console.log('RESTORING APP FROM LOCAL STORAGE');
    const storage = app.settings.storage;
    const appState = JSON.parse(storage.getItem('appState'));
    if (appState) {
      const {
        editingPath,
        lastStorageHost,
        editingName,
        editingType,
        editingFolder,
        editingTitle,
        editorSelection,
        fileTags,
        nodes,
        tags,
        transform,
        scale,
      } = appState;
      data.editingPath(editingPath);
      data.editingName(editingName);
      data.editingType(editingType);
      data.editingFolder(editingFolder);
      data.lastStorageHost(lastStorageHost);
      app.fileTags = fileTags;
      app.nodes([]);
      data.getNodesFromObjects(nodes).forEach((node) => app.nodes.push(node));
      app.tags(tags);
      app.updateNodeLinks();
      app.workspace.setTranslation(transform.x, transform.y);
      app.workspace.setZoom(scale * 4);
      if (editingTitle) {
        app.editNode(app.nodes().find((node) => node.title() === editingTitle));
        if (editorSelection) app.editor.selection.setRange(editorSelection);
      }
      data.isDocumentDirty(true);
      app.refreshWindowTitle();
    }
  },
  readFile: function(file, filename, clearNodes) {
    // Read approach that works for webapps
    var reader = new FileReader();
    reader.onload = function(e) {
      // fileDisplayArea.innerText = reader.result;
      var type = data.getFileType(filename);
      if (type == FILETYPE.UNKNOWN)
        Swal.fire({
          title: 'Unknown filetype!',
          icon: 'error',
        });
      else {
        data.editingPath(file.path);
        data.editingType(type);
        data.loadData(reader.result, type, clearNodes);
      }
    };
    reader.readAsText(file);
  },

  setNewFileStats: function(fileName, filePath, lastStorageHost = 'LOCAL') {
    data.editingName(fileName.replace(/^.*[\\\/]/, ''));
    data.isDocumentDirty(false);
    data.editingPath(filePath);
    data.lastStorageHost(lastStorageHost);
    app.refreshWindowTitle();
  },
  openFile: function(file, filename) {
    const confirmText = data.editingPath()
      ? 'Any unsaved progress to ' + data.editingName() + ' will be lost.'
      : 'Any unsaved progress will be lost.';

    Swal.fire({
      title: 'Are you sure you want to open another file?',
      text: confirmText,
      icon: 'warning',
      showConfirmButton: true,
      showCancelButton: true,
    }).then((result) => {
      if (result.value === true) {
        if (app.editing() !== null) { app.closeEditor(); }
        data.clearFileTags();
        data.readFile(file, filename, true);
        data.setNewFileStats(filename, file.path);
        app.refreshWindowTitle();
      }
    });
  },
  openFileFromFilePath: function(filePath) {
    const fileName = app.path.basename(filePath);
    $.ajax({
      url: filePath,
      async: false,
      success: (result) => {
        const type = data.getFileType(fileName);
        if (type == FILETYPE.UNKNOWN) {
          Swal.fire({
            title: 'Unknown filetype!',
            icon: 'error',
          });
        } else {
          data.loadData(result, type, true);
          data.setNewFileStats(fileName, filePath);
        }
      },
    });
  },
  openFiles: function(file, filename) {
    const files = document.getElementById('open-file').files;
    Object.entries(files).forEach(([key, value]) => {
      if (key === '0') data.openFile(value, value.name);
      else data.appendFile(value, value.name);
    });
  },
  openFolder: function(e, foldername) {
    editingFolder = foldername;
    Swal.fire({
      text:
        'openFolder not yet implemented e: ' + e + ' foldername: ' + foldername,
      icon: 'error',
    });
  },

  appendFile: function(file, filename) {
    data.readFile(file, filename, false);
  },

  getFileType: function(filename) {
    const lowerFileName = filename.toLowerCase();

    if (lowerFileName.endsWith('.json')) return FILETYPE.JSON;
    else if (lowerFileName.endsWith('.yarn.txt')) return FILETYPE.YARN;
    else if (lowerFileName.endsWith('.yarn')) return FILETYPE.YARN;
    else if (lowerFileName.endsWith('.xml')) return FILETYPE.XML;
    else if (lowerFileName.endsWith('.txt')) return FILETYPE.TWEE;
    else if (lowerFileName.endsWith('.tw2')) return FILETYPE.TWEE2;
    else if (lowerFileName.endsWith('.twee')) return FILETYPE.TWEE2;

    return FILETYPE.UNKNOWN;
  },

  loadData: function(content, type, clearNodes) {
    const objects = [];

    if (type == FILETYPE.JSON) {
      content = JSON.parse(content);
      if (!content) {
        return;
      }
      for (let i = 0; i < content.length; i++) {
        objects.push(content[i]);
      }
    } else if (type == FILETYPE.YARN) {
      var lines = content.split(/\r?\n/);
      var obj = {};
      var tags = [];
      var index = 0;
      var readingBody = false;
      var versionMatch = false;
      var crochetTagsFound = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().charAt(0) === '#') {
          if (lines[i].trim().includes('#__PrivCrochet_version:' + data.fileVersion)) {
            versionMatch = true;
          } else {
            app.fileTags.push(lines[i].slice(1));
          }
        } else if (readingBody) {
          // process what we've read so far
          if (!obj.position) {
            obj.position = {
              x: 0,
              y: 0
            }
          }

          // Read in tags
          if (crochetTagsFound === false && tags.length > 0) {
            obj.tags = '';
            tags.forEach(tag => {
              obj.tags += tag + ' ';
            })
            obj.tags = obj.tags.trim();
          } else if (crochetTagsFound && tags.length > obj.tags.split(' ').length) {
            // Add tag to private if it doesn't exist in there already
            tags.forEach(tag => {
              obj.tags += ' ';
              if (obj.tags.includes(tag) === false) {
                obj.tags += tag + ' ';
              }
              obj.tags = obj.tags.trim();
            })
          }
          crochetTagsFound = false;
          tags = [];

          // read rest of body
          while(i < lines.length && lines[i] !== "===") {
            obj.body += lines[i] + '\n';
            i++;
          }
          readingBody = false;

          if (!$.isEmptyObject(obj)) {
            objects.push(obj);
            obj = {};
          }
        } else {
          if (lines[i].includes('title:')) {
            obj.title = lines[i].substr(6).trim();
          } else if (lines[i].trim() == '---') {
            readingBody = true;
            obj.body = '';
          } else if (versionMatch === false && lines[i].includes('tags:')) {
            obj.tags = lines[i].substr(5).trim();
          } else {
            let positionString = (versionMatch) ? '__PrivCrochet_position:' : 'position:';
            let colorIDString = (versionMatch) ? '__PrivCrochet_colorID:' : 'colorID:';
            if (lines[i].includes(positionString)) {
              var xy = lines[i].substr(positionString.length + 1).trim().split(',');
              obj.position = { x: Number(xy[0].trim()), y: Number(xy[1].trim()) };
            } else if (lines[i].includes(colorIDString)) {
              obj.colorID = Number(
                lines[i].substr(colorIDString.length).trim(),
              );
            } else if (lines[i].includes('__PrivCrochet_tags:')) {
              obj.tags = lines[i].substr(19).trim();
              crochetTagsFound = true;
            } else {
              tags.push(lines[i]);
            }
          }
        }
      }
    } else if (type == FILETYPE.TWEE || type == FILETYPE.TWEE2) {
      var lines = content.split('\n');
      var obj = null;
      var index = 0;
      for (var i = 0; i < lines.length; i++) {
        lines[i] = lines[i].trim();
        if (lines[i].substr(0, 2) == '::') {
          if (obj != null) objects.push(obj);

          obj = {};
          index++;

          var title = '';
          var tags = '';
          var position = { x: index * 80, y: index * 80 };

          // check if there are tags
          var openBracket = lines[i].indexOf('[');
          var closeBracket = lines[i].indexOf(']');
          if (openBracket > 0 && closeBracket > 0) {
            tags = lines[i].substr(
              openBracket + 1,
              closeBracket - openBracket - 1,
            );
          }

          // check if there are positions (Twee2)
          var openPosition = lines[i].indexOf('<');
          var closePosition = lines[i].indexOf('>');

          if (openPosition > 0 && closePosition > 0) {
            var coordinates = lines[i]
              .substr(openPosition + 1, closePosition - openPosition - 1)
              .split(',');
            position.x = parseInt(coordinates[0]);
            position.y = parseInt(coordinates[1]);
          }

          var metaStart = 0;
          if (openBracket > 0) {
            metaStart = openBracket;
          } else if (openPosition > 0) {
            // Twee2 dictates that tags must come before position, so we'll only care about this if we don't
            // have any tags for this Passage
            metaStart = openPosition;
          }

          if (metaStart) {
            title = lines[i].substr(3, metaStart - 3);
          } else {
            title = lines[i].substr(3);
          }

          // fix for issue https://github.com/InfiniteAmmoInc/Yarn/issues/83
          title = title.trim();

          obj.title = title;
          obj.tags = tags;
          obj.body = '';
          obj.position = position;
        } else if (obj != null) {
          if (obj.body.length > 0) lines[i] += '\n';
          obj.body += lines[i];
        }
      }

      if (obj != null) objects.push(obj);
    } else if (type == FILETYPE.XML) {
      var oParser = new DOMParser();
      var xml = oParser.parseFromString(content, 'text/xml');
      content = Utils.xmlToObject(xml);

      if (content != undefined)
        for (let i = 0; i < content.length; i++) objects.push(content[i]);
    }

    if (clearNodes) {
      app.nodes.removeAll();
    }
    data.getNodesFromObjects(objects).forEach((node) => app.nodes.push(node));

    app.updateNodeLinks();
    app.updateTagsRepository();
    app.workspace.warpToNodeByIdx(0);
  },
  saveFileTags: function(content) {
    let lines = content.split(/\r?\n/);
    lines.forEach(e => {
      let tag = e.slice(1);
      app.fileTags.push(tag);
    })
    data.trySaveCurrent();
  },
  clearFileTags: function() {
    app.fileTags = [];
  },
  getNodeFromObject: function(object) {
    return new Node({
      title: object.title,
      body: object.body,
      tags: object.tags,
      colorID: object.colorID,
      x: parseInt(object.position.x),
      y: parseInt(object.position.y),
    });
  },
  getNodesFromObjects: function(objects) {
    const appNodes = [];
    if (!objects) return [];
    objects.forEach((object) => {
      appNodes.push(data.getNodeFromObject(object));
    });
    return appNodes;
  },
  getNodeAsObject: function(node) {
    return {
      title: node.title(),
      tags: node.tags(),
      body: node.body(),
      position: { x: node.x(), y: node.y() },
      colorID: node.colorID(),
    };
  },
  getNodesAsObjects: function() {
    const nodesObjects = [];
    const nodes = app.nodes();

    for (var i = 0; i < nodes.length; i++) {
      nodesObjects.push(data.getNodeAsObject(nodes[i]));
    }
    return nodesObjects;
  },
  getSaveData: function(type) {
    var output = '';
    var content = data.getNodesAsObjects();

    if (type == FILETYPE.JSON) {
      output = JSON.stringify(content, null, '\t');
    } else if (type == FILETYPE.YARN) {
      output += "#__PrivCrochet_version:" + data.fileVersion + '\n';
      app.fileTags.forEach(tag => {
        output += "#" + tag + '\n';
      });
      for (let i = 0; i < content.length; i++) {
        output += '__PrivCrochet_colorID: ' + content[i].colorID + '\n';
        output +=
          '__PrivCrochet_position: ' +
          content[i].position.x +
          ',' +
          content[i].position.y +
          '\n';
        output += '__PrivCrochet_tags: ' + content[i].tags + '\n';
        let tags = content[i].tags.split(' ');
        tags.forEach((tag) => {
          if (tag === '') { return; }
          if (!RegExp('[:]').test(tag)) {
            output += tag + ':\n'
          } else {
            output += tag + '\n'
          }
        })
        output += 'title: ' + content[i].title + '\n';
        output += '---\n';
        output += content[i].body;
        var body = content[i].body;
        if (!(body.length > 0 && body[body.length - 1] == '\n')) {
          output += '\n';
        }
        output += '===\n';
      }
    } else if (type == FILETYPE.TWEE) {
      for (let i = 0; i < content.length; i++) {
        var tags = '';
        if (content[i].tags.length > 0) tags = ' [' + content[i].tags + ']';
        output += ':: ' + content[i].title + tags + '\n';
        output += content[i].body + '\n\n';
      }
    } else if (type == FILETYPE.TWEE2) {
      for (let i = 0; i < content.length; i++) {
        var tags = '';
        if (content[i].tags.length > 0) tags = ' [' + content[i].tags + ']';
        var position =
          ' <' + content[i].position.x + ',' + content[i].position.y + '>';
        output += ':: ' + content[i].title + tags + position + '\n';
        output += content[i].body + '\n\n';
      }
    } else if (type == FILETYPE.XML) {
      output += '<nodes>\n';
      for (let i = 0; i < content.length; i++) {
        output += '\t<node>\n';
        output += '\t\t<title>' + content[i].title + '</title>\n';
        output += '\t\t<tags>' + content[i].tags + '</tags>\n';
        output += '\t\t<body>' + content[i].body + '</body>\n';
        output +=
          '\t\t<position x="' +
          content[i].position.x +
          '" y="' +
          content[i].position.y +
          '"></position>\n';
        output += '\t\t<colorID>' + content[i].colorID + '</colorID>\n';
        output += '\t</node>\n';
      }
      output += '</nodes>\n';
    }

    data.isDocumentDirty(false);
    app.refreshWindowTitle();
    return output;
  },

  saveTo: function(path, content, callback = null) {
    if (app.fs != undefined) {
      app.fs.writeFile(path, content, { encoding: 'utf-8' }, function(err) {
        data.editingPath(path);
        if (callback) callback();
        if (err) {
          Swal.fire({
            title: 'Error Saving Data to ' + path + ': ' + err,
            icon: 'error',
          });
        } else {
          app.ui.notification.fire({
            title: 'Saved!',
            icon: 'success',
          });
        }
      });
    }
  },

  openFileDialog: function(dialog, callback) {
    dialog.bind('change', function(e) {
      // make callback
      callback(e.currentTarget.files[0], dialog.val());

      // replace input field with a new identical one, with the value cleared
      // (html can't edit file field values)
      var saveas = '';
      var accept = '';
      if (dialog.attr('nwsaveas') != undefined)
        saveas = 'nwsaveas="' + dialog.attr('nwsaveas') + '"';
      if (dialog.attr('accept') != undefined)
        saveas = 'accept="' + dialog.attr('accept') + '"';

      dialog
        .parent()
        .append(
          '<input type="file" id="' +
            dialog.attr('id') +
            '" ' +
            accept +
            ' ' +
            saveas +
            '>',
        );
      dialog.unbind('change');
      dialog.remove();
    });

    dialog.trigger('click');
  },

  saveFileDialog: function(dialog, type, content) {
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    saveAs(
      blob,
      (data.editingName() || '').replace(/\.[^/.]+$/, '') + '.' + type,
    );
  },

  insertImageFileName: function() {
    data.openFileDialog($('#open-image'), function(e, path) {
      app.insertTextAtCursor(e.path ? e.path : e.name);
    });
  },

  tryOpenFile: function() /// Refactor to send signal to the main process
  {
    data.openFileDialog($('#open-file'), data.openFiles);
  },

  promptFileNameAndFormat: function(cb, suggestions = null) {
    Swal.fire({
      title: '💾 Save file - enter file name',
      html: `<input id="swal-input1" list="select-file-name" name="select" placeholder="${data.editingName()}">
      <datalist class="form-control" id="select-file-name">    
        ${suggestions &&
          suggestions
            .map((suggestion) => `<option value="${suggestion}" />`)
            .join('')}
      </datalist>`,
      onOpen: () => {
        if (data.editingName() !== 'NewFile')
          document.getElementById('swal-input1').value = data.editingName();
      },
      showCancelButton: true,
      preConfirm: () => document.getElementById('swal-input1').value,
    }).then(({ value }) => {
      if (value && value !== '') {
        data.editingName(value);
        const editingType = data.editingType();
        const editingName =
          (data.editingName() || '').replace(/\.[^/.]+$/, '') +
          '.' +
          editingType;
        const yarnData = data.getSaveData(editingType);
        cb({
          editingName,
          yarnData,
        });
      }
    });
  },

  tryShareFilePwa: function(format) {
    data.promptFileNameAndFormat(({ editingName, yarnData }) => {
      const parts = [new Blob([yarnData], { type: 'text/plain' })];
      const file = new File(parts, editingName, {});

      if (
        navigator.canShare &&
        navigator.canShare({
          files: [file],
        })
      ) {
        navigator
          .share({
            title: editingName,
            text: yarnData,
            file: [file],
          })
          .then(() => console.log('Successful share'))
          .catch((error) => console.log('Error sharing', error));
      } else {
        Swal.fire({
          title:
            'Web Share API is not supported in your browser.\nTry using it on your smartphone or tablet...',
          icon: 'error',
        });
      }
    });
  },

  trySaveGist: function(gists) {
    if (gists && gists.file && gists.file.length > 0) {
      gists.get(gists.file).then((gist) => {
        const gistFiles = Object.keys(gist.body.files);
        console.log(gistFiles);
        data.promptFileNameAndFormat(({ editingName, yarnData }) => {
          gists.edit(gists.file, {
            files: { [editingName]: { content: yarnData } },
          });
          Swal.fire(
            'Saved!',
            `The Yarn has been saved to gist ${gists.file}`,
            'success',
          );
          data.lastStorageHost('GIST');
          data.isDocumentDirty(false);
          app.refreshWindowTitle();
        }, gistFiles);
      });
    } else {
      Swal.fire(
        'Not configured',
        'Your github settings are not configured',
        'warning',
      );
      app.ui.openSettingsDialog();
    }
  },

  tryOpenGist: function(gists) {
    if (gists && gists.file && gists.file.length > 0) {
      gists.get(gists.file).then((gist) => {
        const gistFiles = gist.body.files;
        const inputOptions = {};
        Object.keys(gistFiles).forEach((key) => {
          inputOptions[key] = key;
        });
        Swal.fire({
          title: '🐙 Open file from a gist',
          input: 'select',
          inputOptions,
          inputAttributes: {
            autocomplete: 'off',
          },
          inputPlaceholder: 'Select a file from the gist',
          showCancelButton: true,
        }).then(({ value }) => {
          if (value) {
            const content = gistFiles[value].content;
            const type = data.getFileType(value);
            data.loadData(content, type, true);
            data.isDocumentDirty(false);
            data.lastStorageHost('GIST');
            data.editingPath(null);
            data.editingName(value);
            app.refreshWindowTitle();
          }
        });
      });
    } else {
      Swal.fire(
        'Not configured',
        'Your github settings are not configured',
        'warning',
      );
      app.ui.openSettingsDialog();
    }
  },

  tryOpenFolder: function() {
    data.openFileDialog($('#open-folder'), data.openFolder);
  },

  tryAppend: function() {
    data.openFileDialog($('#open-file'), data.appendFile);
  },

  save: function() {
    if (app.editingVisualStudioCodeFile()) {
      // if we're editing a file in the VSCode extension, it handles
      // saving the file on its end so we do nothing here
      return;
    }

    if (data.editingPath()) data.trySaveCurrent();
    else data.trySave(FILETYPE.JSON);
  },

  trySave: function(type) {
    data.editingType(type);
    data.saveFileDialog($('#save-file'), type, data.getSaveData(type));
  },

  trySaveCurrent: function() {
    if (data.lastStorageHost() === 'GIST') {
      const gists = app.gists;
      gists.get(gists.file).then((gist) => {
        const yarnData = data.getSaveData(data.editingType());
        gists.edit(gists.file, {
          files: { [data.editingName()]: { content: yarnData } },
        });
        data.lastStorageHost('GIST');
        data.isDocumentDirty(false);
        app.refreshWindowTitle();
      });
    } else if (!data.editingPath()) {
      data.saveAppStateToLocalStorage();
      Swal.fire({
        title: 'Saved to Internal Storage Only!',
        text: 'Please export the file and re-open it to ensure changes are saved to your disk. If you don\'t, internal storage will be overwritten when you open another file and your changes will be lost.',
        icon: 'info',
      });
    } else if (data.editingPath().length > 0 && data.editingType().length > 0) {
      data.saveTo(data.editingPath(), data.getSaveData(data.editingType()));
    }
  },

  doesFileExist: function(filePath) {
    //todo remove fs from everywhere, use cache to load images instead
    return false;
    if (!fs.existsSync(filePath)) {
      return false;
    }
    return fs.lstatSync(filePath).isFile();
  },
  triggerPasteClipboard: function() {
    if (app.electron) {
      const text = app.electron.clipboard.readText();
      app.clipboard = text;
      document.execCommand('paste');
    } else {
      if (navigator.clipboard) {
        navigator.clipboard
          .readText()
          .then((text) => {
            app.clipboard = text;
          })
          .catch((err) => {
            app.clipboard = app.editor.getSelectedText();
            console.log('No clipboard access', err, 'using local instead');
          });
      }
      // execCommand("paste") will not work on web browsers, due to security
      setTimeout(() => app.insertTextAtCursor(app.clipboard), 100);
    }
  },
  triggerCopyClipboard: function() {
    if (app.electron) {
      app.electron.clipboard.writeText(app.editor.getSelectedText());
      // document.execCommand('copy');
      app.clipboard = app.editor.getSelectedText();
    } else {
      const selectedText = app.editor.getSelectedText();
      app.clipboard = selectedText;
      if (navigator.clipboard && selectedText.length > 0) {
        navigator.clipboard.writeText(selectedText).then(() => {
          /* clipboard successfully set */
          app.clipboard = selectedText;
        });
      }
    }
  },
};
