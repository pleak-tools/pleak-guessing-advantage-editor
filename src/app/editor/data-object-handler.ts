import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { ElementsHandler } from "./elements-handler";

declare let $: any;
declare let jexcel: any;
declare let CodeMirror: any;

declare function require(name:string);
let config = require('../../config.json');

let schemaCodeMirror;
let policyCodeMirror;
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
    if (this.dataObject.sqlDataObjectInfo != null) {
      let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputSchema = savedData.inputSchema;
    }
    return inputSchema;
  }

  getDataObjectInputPolicy() {
    let inputPolicy = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      let savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputPolicy = savedData.inputPolicy;
    }
    return inputPolicy;
  }

  initDataObjectOptionsEditProcess() {
    this.loadDataObjectOptionsPanelTemplate();
  }

  areThereUnsavedDataObjectChanges() {
    if (this.getDataObjectInputSchema() != schemaCodeMirror.getValue() || this.getDataObjectInputPolicy() != policyCodeMirror.getValue() || this.DBInputInitialValue.toString() != $('#DBinputTable').jexcel('getData', false).toString()) {
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
    let inputPolicy = "";
    let inputDB = [];
    let inputSchema = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputSchema = savedData.inputSchema;
      inputPolicy = savedData.inputPolicy;
      inputDB = savedData.inputDB;
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

    this.dataObjectOptionsPanelContainer.find('#data-object-policyInput').val(inputPolicy);
    policyCodeMirror = CodeMirror.fromTextArea(document.getElementById("data-object-policyInput"), {
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    if (inputPolicy == null) {
      inputPolicy = "";
    }
    policyCodeMirror.setValue(inputPolicy);

    $('.jexcel').remove();
    DBJexcel = null;
    DBJexcel = this.dataObjectOptionsPanelContainer.find('#DBinputTable');
    DBJexcel.jexcel({
      data: inputDB,
      minDimensions: [10,7],
      editable: this.elementsHandler.canEdit,
      onselection: function() {
        setTimeout(function() {
          $("#jexcel_contextmenu a:last-child").hide();
        }, 1);
      }
    });

    this.DBInputInitialValue = $('#DBinputTable').jexcel('getData', false);

    setTimeout(function() {
      policyCodeMirror.refresh();
      schemaCodeMirror.refresh();
    }, 10);

    this.highlightDataObject();
    this.canvas.addMarker(this.dataObject.id, 'selected');

    this.initDataObjectOptionsButtons();
    let optionsPanel = this.dataObjectOptionsPanelContainer;
    optionsPanel.detach();
    $('#sidebar').prepend(optionsPanel);
    $('#sidebar').scrollTop(0);
    this.dataObjectOptionsPanelContainer.show();

  }

  getPreparedQueries() {
    let savedData;
    let inputSchema, inputPolicy, inputDB = "";
    if (this.dataObject.sqlDataObjectInfo != null) {
      savedData = JSON.parse(this.dataObject.sqlDataObjectInfo);
      inputSchema = savedData.inputSchema;
      inputPolicy = savedData.inputPolicy;
      inputDB = savedData.inputDB;
    }
    if (inputDB) {
      let policyOutput = inputPolicy;
      let DBOutput = "";
      let schemaOutput = inputSchema;
      for (let row of inputDB) {
        for (let col of row) {
          DBOutput += col + " ";
        }
        DBOutput = DBOutput + "\n";
      }
      DBOutput = DBOutput.trim();
      let name = this.dataObject.name.trim().replace(/ *\([^)]*\) */g, "").replace(/\s+/g, "_");

      return {id: this.dataObject.id, name: name, policy: policyOutput, db: DBOutput, schema: schemaOutput};
    }
  }

  loadDataObjectOptionsPanelTemplate() {
    if ($('#input-options').has('#data-object-options-panel').length) {
      this.initDataObjectOptionsPanel();
    } else {
      $('#input-options').prepend($('<div>').load(config.frontend.host + '/' + config.policy_editor.folder + '/src/app/editor/templates/data-object-options-panel.html', () => {
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
    let inputPolicy = policyCodeMirror.getValue();
    let inputDB = $('#DBinputTable').jexcel('getData', false);
    let object = {inputNRM: inputNRM, inputPolicy: inputPolicy, inputDB: inputDB, inputSchema: inputSchema};
    this.dataObject.sqlDataObjectInfo = JSON.stringify(object);
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