import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { ElementsHandler } from './elements-handler';

declare let $: any;
declare let CodeMirror: any;

declare function require(name: string);

let config = require('../../config.json');

let taskQueryMirror;

export class TaskHandler {

  constructor(elementsHandler: ElementsHandler, task: any) {
    this.viewer = elementsHandler.viewer;
    this.registry = this.viewer.get('elementRegistry');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');

    this.elementsHandler = elementsHandler;
    this.task = task;

    this.init();
  }

  beingEdited: Boolean = false;

  viewer: Viewer;
  registry: any;
  canvas: any;
  overlays: any;

  elementsHandler: ElementsHandler;
  task: any;

  taskOptionsPanelContainer: any;

  getTaskId() {
    return this.task.id;
  }

  getTaskInputQuery() {
    let query = '';
    if (this.task.sqlScript != null) {
      query = this.task.sqlScript;
    }
    if (!query || query.length === 0) {
      if (this.task.sqlTaskInfo != null) {
        let savedData = JSON.parse(this.task.sqlTaskInfo);
        query = savedData.input1;
      }
    }
    return query;
  }

  init() {
  }

  initTaskOptionsEditProcess() {
    this.loadTaskOptionsPanelTemplate();
  }

  areThereUnsavedTaskChanges() {
    if (this.getTaskInputQuery() != taskQueryMirror.getValue()) {
      return true;
    } else {
      return false;
    }
  }

  checkForUnsavedTaskChangesBeforeTerminate() {
    if (this.areThereUnsavedTaskChanges()) {
      if (confirm('You have some unsaved changes. Would you like to revert these changes?')) {
        this.terminateTaskOptionsEditProcess();
      } else {
        return false;
      }
    } else {
      this.terminateTaskOptionsEditProcess();
    }
  }

  terminateTaskOptionsEditProcess() {
    this.beingEdited = false;
    this.taskOptionsPanelContainer.find('#task-query').val('');
    this.removeTaskInputsOutputsHighlights();
    this.canvas.removeMarker(this.task.id, 'selected');
    this.terminateTaskOptionsButtons();
    this.taskOptionsPanelContainer.hide();
    this.elementsHandler.terminateTaskSelectMenu();
  }

  initTaskOptionsPanel() {
    this.beingEdited = true;
    this.taskOptionsPanelContainer = $('#task-options-panel');

    let taskName = 'undefined';
    if (this.task.name) {
      taskName = this.task.name;
    }
    this.taskOptionsPanelContainer.find('.task-name').text(taskName);

    let input1 = '';
    if (this.task.sqlScript != null) {
      input1 = this.task.sqlScript;
    }
    if (!input1 || input1.length === 0) {
      if (this.task.sqlTaskInfo != null) {
        let savedData = JSON.parse(this.task.sqlTaskInfo);
        input1 = savedData.input1;
      }
    }
    this.taskOptionsPanelContainer.find('#task-query').val(input1);

    if (!this.elementsHandler.canEdit) {
      this.taskOptionsPanelContainer.find('.panel-footer').hide();
    }

    $('.task-options-panel, .data-object-options-panel').find('.CodeMirror').remove();
    taskQueryMirror = CodeMirror.fromTextArea(document.getElementById('task-query'), {
      mode: 'text/x-mysql',
      readOnly: !this.elementsHandler.canEdit,
      lineNumbers: false,
      showCursorWhenSelecting: true
    });
    setTimeout(function () {
      taskQueryMirror.refresh();
    }, 10);

    this.highlightTaskInputAndOutputObjects();
    this.canvas.addMarker(this.task.id, 'selected');

    this.initTaskOptionsButtons();
    let optionsPanel = this.taskOptionsPanelContainer;
    optionsPanel.detach();
    $('.analysis-settings-container').prepend(optionsPanel);
    $('#sidebar').scrollTop(0);
    this.taskOptionsPanelContainer.show();

  }

  getPreparedQuery() {
    let input = "";
    if (this.task.sqlScript != null) {
      input = this.task.sqlScript;
    }
    if (!input || input.length === 0) {
      if (this.task.sqlTaskInfo != null) {
        let savedData = JSON.parse(this.task.sqlTaskInfo);
        input = savedData.input1;
      }
    }
    if (input) {
      if (input.indexOf('$$') !== -1) {
        let result = this.elementsHandler.pg_parser.parse(input);
        if (result.parse_tree.length) {
          return { success: { id: this.task.id, taskName: this.task.name ? this.task.name.trim().replace(/\s+/g, '_') : "unnamed", query: input } };
        } else {
          return { error: result.error.message };
        }
      } else {
        let result = this.elementsHandler.pg_parser.parse(input);
        if (result.parse_tree.length) {
          return { success: { id: this.task.id, taskName: this.task.name ? this.task.name.trim().replace(/\s+/g, '_') : "unnamed", query: input } };
        } else {
          return { error: result.error.message };
        }
      }
    } else {
      return { error: 'Query not found' };
    }
  }

  loadTaskOptionsPanelTemplate() {
    if ($('#input-options').has('#task-options-panel').length) {
      this.initTaskOptionsPanel();
    } else {
      $('#input-options').prepend($('<div>').load(config.frontend.host + '/' + config.guessing_advantage_editor.folder + '/src/app/editor/templates/task-options-panel.html', () => {
        this.initTaskOptionsPanel();
      }));
    }
  }

  initTaskOptionsButtons() {
    this.terminateTaskOptionsButtons();
    this.taskOptionsPanelContainer.one('click', '#task-options-save-button', () => {
      this.saveTaskOptions();
    });
    this.taskOptionsPanelContainer.on('click', '#task-options-hide-button', () => {
      this.checkForUnsavedTaskChangesBeforeTerminate();
    });
    this.taskOptionsPanelContainer.on('click', '#task-script-fullscreen', () => {
      this.elementsHandler.parent.openScriptModal(taskQueryMirror.getValue(), (this.task.name ? this.task.name : "unnamed") + " - Edit SQL script", 'task', this.task.id);
    });
  }

  terminateTaskOptionsButtons() {
    this.taskOptionsPanelContainer.off('click', '#task-options-save-button');
    this.taskOptionsPanelContainer.off('click', '#task-options-hide-button');
    this.taskOptionsPanelContainer.off('click', '#task-script-fullscreen');
  }

  updateTaskOptions() {
    // let infoObj = { input1: taskQueryMirror.getValue() };
    // this.task.sqlTaskInfo = JSON.stringify(infoObj);
    this.task.sqlScript = taskQueryMirror.getValue();
  }

  saveTaskOptions() {
    this.updateTaskOptions();
    this.terminateTaskOptionsEditProcess();
    this.setNewModelContentVariableContent();
    this.canvas.removeMarker(this.task.id, 'highlight-general-error');
  }

  removeTaskOptions() {
    this.terminateTaskOptionsEditProcess();
    delete this.task.sqlTaskInfo;
    this.setNewModelContentVariableContent();
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

  setSQLScriptValue(script: string): void {
    if (script) {
      taskQueryMirror.setValue(script);
    }
  }

  // Highlight inputs and outputs of the task
  highlightTaskInputAndOutputObjects() {
    let taskInputOutputObjects = this.getTaskInputOutputObjects();
    for (let inputOutputObj of taskInputOutputObjects) {
      this.canvas.addMarker(inputOutputObj.id, 'highlight-input-output-selected');
    }
    for (let inputObject of this.getTaskInputObjects()) {
      if (taskInputOutputObjects.indexOf(inputObject) === -1) {
        this.canvas.addMarker(inputObject.id, 'highlight-input-selected');
      }
    }
    for (let outputObj of this.getTaskOutputObjects()) {
      if (taskInputOutputObjects.indexOf(outputObj) === -1) {
        this.canvas.addMarker(outputObj.id, 'highlight-output-selected');
      }
    }
    this.canvas.addMarker(this.task.id, 'highlight-task');
  }

  // Remove highlighting of task inputs and outputs
  removeTaskInputsOutputsHighlights() {
    for (let inputOutputObj of this.getTaskInputOutputObjects()) {
      this.canvas.removeMarker(inputOutputObj.id, 'highlight-input-output-selected');
    }
    for (let inputObj of this.getTaskInputObjects()) {
      this.canvas.removeMarker(inputObj.id, 'highlight-input-selected');
    }
    for (let outputObj of this.getTaskOutputObjects()) {
      this.canvas.removeMarker(outputObj.id, 'highlight-output-selected');
    }
    this.canvas.removeMarker(this.task.id, 'highlight-task');
  }

  // Return all input elements of the task
  getTaskInputObjects() {
    let objects = [];
    if (this.task.id != null) {
      let task = this.registry.get(this.task.id).businessObject;
      if (task.dataInputAssociations) {
        for (let i = 0; i < task.dataInputAssociations.length; i++) {
          if (task.dataInputAssociations[i].sourceRef) {
            objects.push(this.registry.get(task.dataInputAssociations[i].sourceRef[0].id));
          }
        }
      }
    }
    return objects;
  }

  // Return all output elements of the task
  getTaskOutputObjects() {
    let objects = [];
    if (this.task.id != null) {
      let task = this.registry.get(this.task.id).businessObject;
      if (task.dataOutputAssociations) {
        for (let i = 0; i < task.dataOutputAssociations.length; i++) {
          if (task.dataOutputAssociations[i].targetRef) {
            objects.push(this.registry.get(task.dataOutputAssociations[i].targetRef.id));
          }
        }
      }
    }
    return objects;
  }

  // Return all elements that are inputs and outputs at the same time of the task
  getTaskInputOutputObjects() {
    let objects = [];
    if (this.task.id != null) {
      let allInputsOutputs = [];
      let allInputs = [];
      let allOutputs = [];
      for (let inputObj of this.getTaskInputObjects()) {
        allInputsOutputs.push(inputObj);
        allInputs.push(inputObj);
      }
      for (let outputObj of this.getTaskOutputObjects()) {
        allInputsOutputs.push(outputObj);
        allOutputs.push(outputObj);
      }
      for (let obj of allInputsOutputs) {
        if (allInputs.indexOf(obj) !== -1 && allOutputs.indexOf(obj) !== -1 && objects.indexOf(obj) === -1) {
          objects.push(obj);
        }
      }
    }
    return objects;
  }

  /** Wrappers to access elementsHandler functions*/

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

}
