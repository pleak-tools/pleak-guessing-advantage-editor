import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { ElementsHandler } from "./elements-handler";

declare let $: any;
declare let jexcel: any;
declare let CodeMirror: any;

declare function require(name: string);
let config = require('../../config.json');

let schemaCodeMirror;
let constraintsCodeMirror;
let DBJexcel;

export class DataObjectHandler {

  constructor(elementsHandler: ElementsHandler, dataObject: any) {
    this.viewer = elementsHandler.viewer;
    this.registry = this.viewer.get('elementRegistry');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');

    this.elementsHandler = elementsHandler;
    this.dataObject = dataObject;

  }

  beingEdited: Boolean = false;

  viewer: Viewer;
  registry: any;
  canvas: any;
  overlays: any;

  elementsHandler: ElementsHandler;
  dataObject: any;

  dataObjectOptionsPanelContainer: any;

  DBInputInitialValue: any = null;

  getDataObjectId() {
    return this.dataObject.id;
  }

  getDataObjectInputNRM() {
    let inputNRM = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputNRM = savedData.inputNRM;
    }
    return inputNRM;
  }

  getDataObjectInputSchema() {
    let inputSchema = "";
    if (this.dataObject.sqlScript != null) {
      inputSchema = this.dataObject.sqlScript;
    }
    if (inputSchema.length === 0) {
      if (this.dataObject.sqlDataObjectInfo != null) {
        let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
        if (savedData && savedData.inputSchema) {
          inputSchema = savedData.inputSchema;
        }
      }
    }
    return inputSchema;
  }

  getDataObjectInputConstraints() {
    let inputConstraints = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputConstraints = savedData.inputConstraints;
    }
    if (!inputConstraints || inputConstraints.length === 0) {
      if (this.dataObject.attackerSettings != null) {
        inputConstraints = this.dataObject.attackerSettings;
      }
    }
    return inputConstraints;
  }

  initDataObjectOptionsEditProcess() {
    this.loadDataObjectOptionsPanelTemplate();
  }

  areThereUnsavedDataObjectChanges() {
    if (this.getDataObjectInputSchema() != schemaCodeMirror.getValue() || this.getDataObjectInputConstraints() != constraintsCodeMirror.getValue() || this.DBInputInitialValue.toString() != $('#DBinputTable').jexcel('getData', false).toString()) {
      return true;
    } else {
      return false;
    }
  }

  checkForUnsavedDataObjectChangesBeforeTerminate() {
    if (this.areThereUnsavedDataObjectChanges()) {
      if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
        this.terminateDataObjectOptionsEditProcess();
      } else {
        this.canvas.addMarker(this.dataObject.id, 'selected');
        return false;
      }
    } else {
      this.terminateDataObjectOptionsEditProcess();
    }
  }

  terminateDataObjectOptionsEditProcess() {
    this.beingEdited = false;
    this.DBInputInitialValue = null;
    this.removeDataObjectHighlights();
    this.canvas.removeMarker(this.dataObject.id, 'selected');
    this.terminateDataObjectOptionsButtons();
    this.dataObjectOptionsPanelContainer.hide();
  }

  initDataObjectOptionsPanel() {
    this.beingEdited = true;
    this.dataObjectOptionsPanelContainer = $('#data-object-options-panel');

    let dataObjectName = "undefined";
    if (this.dataObject.name) {
      dataObjectName = this.dataObject.name;
    }
    this.dataObjectOptionsPanelContainer.find('.data-object-name').text(dataObjectName);

    if (!this.elementsHandler.canEdit) {
      this.dataObjectOptionsPanelContainer.find('.panel-footer').hide();
    }

    let savedData;
    let inputDB = [];
    let inputSchema = "";
    let inputConstraints = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      // inputSchema = savedData.inputSchema;
      inputConstraints = savedData.inputConstraints;
      inputDB = savedData.inputDB;
    }
    if (!inputConstraints || inputConstraints.length === 0) {
      if (this.dataObject.attackerSettings != null) {
        inputConstraints = this.dataObject.attackerSettings;
      }
    }
    if (!inputDB || inputDB.length === 0) {
      if (this.dataObject.tableData != null) {
        inputDB = this.dataObject.tableData;
      }
    }
    if (this.dataObject.sqlScript != null) {
      inputSchema = this.dataObject.sqlScript;
    }
    if (!inputSchema || inputSchema.length === 0) {
      if (this.dataObject.sqlDataObjectInfo != null) {
        let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
        if (savedData && savedData.inputSchema) {
          inputSchema = savedData.inputSchema;
        }
      }
    }
    $('.task-options-panel, .data-object-options-panel').find('.CodeMirror').remove();
    this.dataObjectOptionsPanelContainer.find('#data-object-schemaInput').val(inputSchema);
    schemaCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-schemaInput"), {
      mode: "text/x-mysql",
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    if (inputSchema == null) {
      inputSchema = "";
    }
    schemaCodeMirror.setValue(inputSchema);

    this.dataObjectOptionsPanelContainer.find('#data-object-constraintsInput').val(inputConstraints);
    constraintsCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-constraintsInput"), {
      mode: "text/x-mysql",
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    if (inputConstraints == null) {
      inputConstraints = "";
    }
    constraintsCodeMirror.setValue(inputConstraints);

    $('.jexcel').remove();
    DBJexcel = null;
    DBJexcel = this.dataObjectOptionsPanelContainer.find('#DBinputTable');
    DBJexcel.jexcel({
      data: inputDB,
      minDimensions: [10, 7],
      editable: this.elementsHandler.canEdit,
      onselection: function () {
        setTimeout(function () {
          $("#jexcel_contextmenu a:last-child").hide();
        }, 1);
      }
    });

    this.DBInputInitialValue = $('#DBinputTable').jexcel('getData', false);

    setTimeout(function () {
      schemaCodeMirror.refresh();
      constraintsCodeMirror.refresh();
    }, 10);

    this.highlightDataObject();
    this.canvas.addMarker(this.dataObject.id, 'selected');

    this.initDataObjectOptionsButtons();
    let optionsPanel = this.dataObjectOptionsPanelContainer;
    optionsPanel.detach();
    $('.analysis-settings-container').prepend(optionsPanel);
    $('#sidebar').scrollTop(0);
    this.dataObjectOptionsPanelContainer.show();

  }

  getPreparedQueries() {
    let savedData;
    let inputSchema, inputDB = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputDB = savedData.inputDB;
    }
    if (!inputDB || inputDB.length === 0) {
      if (this.dataObject.tableData != null) {
        inputDB = this.dataObject.tableData;
      }
    }
    if (this.dataObject.sqlScript != null) {
      inputSchema = this.dataObject.sqlScript;
    }
    if (!inputSchema || inputSchema.length === 0) {
      if (this.dataObject.sqlDataObjectInfo != null) {
        let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
        if (savedData && savedData.inputSchema) {
          inputSchema = savedData.inputSchema;
        }
      }
    }
    if (inputDB) {
      let DBOutput = "";
      let schemaOutput = inputSchema;
      for (let row of inputDB) {
        for (let col of row) {
          DBOutput += col + " ";
        }
        DBOutput = DBOutput.trim() + "\n";
      }
      DBOutput = DBOutput.trim();
      let name = this.dataObject.name.trim().replace(/ *\([^)]*\) */g, "").replace(/\s+/g, "_");
      return { id: this.dataObject.id, name: name, db: DBOutput, schema: schemaOutput };
    }
  }

  getPreparedConstraints() {
    let inputConstraints = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputConstraints = savedData.inputConstraints;
    }
    if (!inputConstraints || inputConstraints.length === 0) {
      if (this.dataObject.attackerSettings != null) {
        inputConstraints = this.dataObject.attackerSettings;
      }
    }
    if (inputConstraints && inputConstraints.length > 0) {
      let tableName = this.dataObject.name ? this.dataObject.name.toLowerCase().replace(' ', '_') : "undefined";
      inputConstraints = inputConstraints.split('\n').join(`\n${tableName}.`);
      inputConstraints = `${tableName}.${inputConstraints}`;
    }
    return inputConstraints;
  }

  loadDataObjectOptionsPanelTemplate() {
    if ($('#input-options').has('#data-object-options-panel').length) {
      this.initDataObjectOptionsPanel();
    } else {
      $('#input-options').prepend($('<div>').load(config.frontend.host + '/' + config.guessing_advantage_editor.folder + '/src/app/editor/templates/data-object-options-panel.html', () => {
        this.initDataObjectOptionsPanel();
      }));
    }
  }

  initDataObjectOptionsButtons() {
    this.terminateDataObjectOptionsButtons();
    this.dataObjectOptionsPanelContainer.one('click', '#data-object-options-save-button', (e) => {
      this.saveDataObjectOptions();
    });
    this.dataObjectOptionsPanelContainer.on('click', '#data-object-options-hide-button', (e) => {
      this.checkForUnsavedDataObjectChangesBeforeTerminate();
    });
  }

  terminateDataObjectOptionsButtons() {
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-save-button');
    this.dataObjectOptionsPanelContainer.off('click', '#data-object-options-hide-button');
  }

  updateDataObjectOptions() {
    let inputNRM = this.getDataObjectInputNRM();
    let inputSchema = schemaCodeMirror.getValue();
    let inputConstraints = constraintsCodeMirror.getValue();
    let inputDB = $('#DBinputTable').jexcel('getData', false);
    let cleanedInputDB = [];
    for (let row of inputDB) {
      let cleanedRow = [];
      for (let cell of row) {
        if (cell.length > 0) {
          cleanedRow.push(cell.trim());
        }
      }
      if (cleanedRow.length > 0) {
        cleanedInputDB.push(cleanedRow);
      }
    }
    let object = { inputNRM: inputNRM, inputDB: cleanedInputDB, inputSchema: inputSchema, inputConstraints: inputConstraints };
    this.dataObject.sqlDataObjectInfo = JSON.stringify(object);
    this.dataObject.sqlScript = schemaCodeMirror.getValue();
  }

  saveDataObjectOptions() {
    this.updateDataObjectOptions();
    this.terminateDataObjectOptionsEditProcess();
    this.setNewModelContentVariableContent();
  }

  removeDataObjectOptions() {
    this.terminateDataObjectOptionsEditProcess();
    delete this.dataObject.sqlDataObjectInfo;
    this.setNewModelContentVariableContent();
  }

  highlightDataObject() {
    this.canvas.addMarker(this.dataObject.id, 'highlight-data-object');
  }

  removeDataObjectHighlights() {
    this.canvas.removeMarker(this.dataObject.id, 'highlight-data-object');
  }

  setNewModelContentVariableContent() {
    this.viewer.saveXML(
      {
        format: true
      },
      (err: any, xml: string) => {
        this.updateModelContentVariable(xml);
      }
    );
  }

  /** Wrappers to access elementsHandler functions*/

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

}