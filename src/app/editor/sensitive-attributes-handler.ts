import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

declare let $: any;
declare let CodeMirror: any;

declare function require(name:string);
let config = require('../../config.json');

let sensitiveAttributesCodeMirror;

export class SensitiveAttributesHandler {

  constructor(viewer: Viewer, diagram: String, parent: any) {
    this.viewer = viewer;
    this.eventBus = this.viewer.get('eventBus');
    this.registry = this.viewer.get('elementRegistry');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');
    this.diagram = diagram;
    this.elementsHandler = parent;
    this.editor = parent.parent;
  }
    
  viewer: Viewer;
  eventBus: any;
  registry: any;
  canvas: any;
  overlays: any;
  diagram: String;
    
  editor: any;
  elementsHandler: any;

  sensitiveAttributesPanelContainer: any;

  getSavedSensitiveAttributes() {
    let rootElement = this.canvas.getRootElement();
    let root = null;
    if (rootElement && rootElement.businessObject) {
      root = this.registry.get(rootElement.businessObject.id);
    }
    if (root && root.businessObject && root.businessObject.policyInfo != null) {
      return JSON.parse(root.businessObject.policyInfo).sensitiveAttributes;
    } else {
      return null;
    }
  }

  getCurrentSensitiveAttributes() {
    return sensitiveAttributesCodeMirror.getValue();
  }

  getSensitiveAttributes() {
    if (this.areSensitiveAttributesLoaded()) {
      return this.getCurrentSensitiveAttributes();
    } else {
      return this.getSavedSensitiveAttributes();
    }
  }

  initSensitiveAttributesEditProcess() {
    if (!$('#sensitive-attributes-panel').is(":visible")) {
      this.loadSensitiveAttributesPanelTemplate();
    }
  }

  loadSensitiveAttributesPanelTemplate() {
    if ($('#sidebar').has('#sensitive-attributes-panel').length) {
      this.initSensitiveAttributesPanel();
    } else {
      $('#sidebar').append($('<div>').load(config.frontend.host + '/' + config.guessing_advantage_editor.folder + '/src/app/editor/templates/sensitive-attributes-panel.html', () => {
        this.initSensitiveAttributesPanel();
      }));
    }
  }

  initSensitiveAttributesPanel() {
    this.sensitiveAttributesPanelContainer = $('#sensitive-attributes-panel');
    if (!this.elementsHandler.canEdit) {
      this.sensitiveAttributesPanelContainer.find('#sensitive-attributes-save-button').hide();
    }
    $('#sensitive-attributes-panel').find('.CodeMirror').remove();

    let sensitiveAttributes = this.getSavedSensitiveAttributes();
    this.sensitiveAttributesPanelContainer.find('#sensitive-attributes').val(sensitiveAttributes);
    sensitiveAttributesCodeMirror = CodeMirror.fromTextArea(document.getElementById("sensitive-attributes"), {
      mode: "text/x-mysql",
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true,
      lineWiseCopyCut: false
    });
    if (sensitiveAttributes == null) {
      sensitiveAttributes = "";
    }
    sensitiveAttributesCodeMirror.setValue(sensitiveAttributes);
    setTimeout(function() {
      sensitiveAttributesCodeMirror.refresh();
    }, 10);
    this.initSensitiveAttributesButtons();
    $('#sensitive-attributes-button').prop('disabled', true);
    this.sensitiveAttributesPanelContainer.show();
  }

  terminateSensitiveAttributesPanel() {
    this.terminateSensitiveAttributesOptionsButtons();
    $('#sensitive-attributes-button').prop('disabled', false);
    this.sensitiveAttributesPanelContainer.hide();
  }

  initSensitiveAttributesButtons() {
    this.terminateSensitiveAttributesOptionsButtons();
    this.sensitiveAttributesPanelContainer.one('click', '#sensitive-attributes-save-button', (e) => {
      this.saveSensitiveAttributes();
    });
    this.sensitiveAttributesPanelContainer.on('click', '#sensitive-attributes-hide-button', (e) => {
      this.checkForUnsavedSensitiveAttributesChangesBeforeTerminate();
    });
  }

  terminateSensitiveAttributesOptionsButtons() {
    this.sensitiveAttributesPanelContainer.off('click', '#sensitive-attributes-save-button');
    this.sensitiveAttributesPanelContainer.off('click', '#sensitive-attributes-hide-button');
  }

  updateSensitiveAttributes() {
    let sensitiveAttributes = sensitiveAttributesCodeMirror.getValue();
    let attackerKnowledge = "";
    let rootElement = this.canvas.getRootElement();
    let root = null;
    if (rootElement && rootElement.businessObject) {
      root = this.registry.get(rootElement.businessObject.id);
    }
    if (root && root.businessObject) {
      if (root.businessObject.policyInfo != null) {
        attackerKnowledge = JSON.parse(root.businessObject.policyInfo).attackerKnowledge;
      }
      let object = {attackerKnowledge: attackerKnowledge, sensitiveAttributes: sensitiveAttributes};
      root.businessObject.policyInfo = JSON.stringify(object);
    }
  }

  saveSensitiveAttributes() {
    this.updateSensitiveAttributes();
    this.terminateSensitiveAttributesPanel();
    this.setNewModelContentVariableContent();
  }

  checkForUnsavedSensitiveAttributesChangesBeforeTerminate() {
    if (this.areThereUnsavedChanges()) {
      if (confirm('Are you sure you wish to revert unsaved attributes?')) {
        this.terminateSensitiveAttributesPanel();
      } else {
        return false;
      }
    }
    this.terminateSensitiveAttributesPanel();
  }

  areSensitiveAttributesLoaded() {
    if ($('#sidebar').has('#sensitive-attributes-panel').length) {
      return true;
    }
    return false;
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

  areThereUnsavedChanges() {
    if (this.areSensitiveAttributesLoaded()) {
      let currentAttributes = JSON.stringify(this.getCurrentSensitiveAttributes());
      let savedAttributes = JSON.stringify(this.getSavedSensitiveAttributes());
      if (currentAttributes !== savedAttributes) {
        return true;
      }
    }
    return false;
  }

  /** Wrappers to access elementsHandler functions*/

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

}