import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { AnalysisHandler } from './analysis-handler';
import { TaskHandler } from "./task-handler";
import { DataObjectHandler } from "./data-object-handler";
import { SensitiveAttributesHandler } from './sensitive-attributes-handler';
import { EditorComponent } from './editor.component';
import { PropagationHandler } from './propagation-handler';

declare let $: any;
let is = (element, type) => element.$instanceOf(type);

export class ElementsHandler {

  constructor(viewer: Viewer, diagram: String, pg_parser, parent: any, canEdit: Boolean) {
    this.viewer = viewer;
    this.eventBus = this.viewer.get('eventBus');
    this.canvas = this.viewer.get('canvas');
    this.overlays = this.viewer.get('overlays');
    this.diagram = diagram;
    this.pg_parser = pg_parser;
    this.parent = parent;
    this.canEdit = canEdit;
    this.init();
  }

  viewer: Viewer;
  eventBus: any;
  canvas: any;
  overlays: any;
  diagram: String;
  pg_parser: any;
  parent: EditorComponent;
  canEdit: Boolean;

  analysisHandler: AnalysisHandler;

  sensitiveAttributesHandler: SensitiveAttributesHandler;

  propagationHandler: PropagationHandler;

  taskHandlers: TaskHandler[] = [];
  dataObjectHandlers: DataObjectHandler[] = [];

  selectedTasks: any[] = [];
  selectedTaskSettings: any = null;

  init() {
    // Import model from xml file
    this.viewer.importXML(this.diagram, () => {
      this.canvas.zoom('fit-viewport', 'auto');
      this.viewer.get("moddle").fromXML(this.diagram, (err: any, definitions: any) => {
        if (typeof definitions !== 'undefined') {
          // Add stereotype labels to elements based on xml labels
          this.viewer.importDefinitions(definitions, () => this.createElementHandlerInstances(definitions));
          this.parent.initExportButton();
        }
      });
      // Add click event listener to init and terminate stereotype processes
      this.eventBus.on('element.click', (e) => {

        // Selecting dataObjects and dataStores for SQL leaks-when analysis

        if (is(e.element.businessObject, 'bpmn:Task') || is(e.element.businessObject, 'bpmn:DataObjectReference') || is(e.element.businessObject, 'bpmn:DataStoreReference')) {
          this.canvas.removeMarker(e.element.id, 'selected');
          let beingEditedElementHandler = this.taskHandlers.filter(function (obj) {
            return obj.task != e.element.businessObject && obj.beingEdited;
          });
          if (beingEditedElementHandler.length > 0) {
            beingEditedElementHandler[0].checkForUnsavedTaskChangesBeforeTerminate();
          }

          let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function (obj) {
            return obj.dataObject != e.element.businessObject && obj.beingEdited;
          });
          if (beingEditedDataObjectHandler.length > 0) {
            beingEditedDataObjectHandler[0].checkForUnsavedDataObjectChangesBeforeTerminate();
          }
        }

        let toBeEditedelementHandler = [];
        if (!this.isAnotherTaskOrDataObjectBeingEdited(e.element.id)) {
          if (is(e.element.businessObject, 'bpmn:Task')) {
            toBeEditedelementHandler = this.taskHandlers.filter(function (obj) {
              return obj.task == e.element.businessObject && obj.beingEdited == false;
            });
            if (toBeEditedelementHandler.length > 0) {
              toBeEditedelementHandler[0].initTaskOptionsEditProcess();
            }
            this.initTaskSelectMenu(e.element);
          } else if (is(e.element.businessObject, 'bpmn:DataObjectReference') || is(e.element.businessObject, 'bpmn:DataStoreReference')) {
            toBeEditedelementHandler = this.dataObjectHandlers.filter(function (obj) {
              return obj.dataObject == e.element.businessObject && obj.beingEdited == false;
            });
            if (toBeEditedelementHandler.length > 0) {
              toBeEditedelementHandler[0].initDataObjectOptionsEditProcess();
            }
          }
        }

      });
    });
    this.analysisHandler = new AnalysisHandler(this.viewer, this.diagram, this);
    this.sensitiveAttributesHandler = new SensitiveAttributesHandler(this.viewer, this.diagram, this);
    this.propagationHandler = new PropagationHandler(this.viewer, this.diagram, this);
    this.prepareParser();
  }


  initTaskSelectMenu(element: any): void {
    this.terminateTaskSelectMenu();
    if (element.type === "bpmn:Task") {
      this.reloadTaskSelectMenu(element);
    }
  }

  reloadTaskSelectMenu(element: any): void {
    this.terminateTaskSelectMenu();
    const taskId = element.businessObject.id;

    let overlayHtml = `<div class="task-selector-editor" id="` + taskId + `-task-selector" style="background:white; padding:10px; border-radius:2px">`;

    if (element.type === "bpmn:Task") {
      const index = this.selectedTasks.findIndex(x => x === element.businessObject);
      if (index === -1) {
        overlayHtml += `<button class="btn btn-default" id="` + taskId + `-task-on-button">Select</button><br>`;
      } else {
        overlayHtml += `<button class="btn btn-default" id="` + taskId + `-task-off-button">Deselect</button><br>`;
      }
    }
    overlayHtml += `</div>`;
    overlayHtml = $(overlayHtml);

    this.selectedTaskSettings = this.overlays.add(element, {
      position: {
        top: -15,
        right: -30
      },
      html: overlayHtml
    });

    if (element.type === "bpmn:Task") {
      const index = this.selectedTasks.findIndex(x => x === element.businessObject);
      if (index === -1) {
        $(overlayHtml).on('click', '#' + taskId + '-task-on-button', () => {
          this.selectedTasks.push(element.businessObject);
          this.canvas.addMarker(element.id, 'highlight-task-selected');
          this.reloadTaskSelectMenu(element);
        });
      } else {
        $(overlayHtml).on('click', '#' + taskId + '-task-off-button', () => {
          this.selectedTasks.splice(index, 1);
          this.canvas.removeMarker(element.id, 'highlight-task-selected');
          this.reloadTaskSelectMenu(element);
        });
      }
    }
  }

  terminateTaskSelectMenu(): void {
    if (this.selectedTaskSettings != null) {
      this.overlays.remove({ id: this.selectedTaskSettings });
      this.selectedTaskSettings = null;
    }
  }

  // Check if another element (compared to the input id) is being currently edited
  isAnotherTaskOrDataObjectBeingEdited(elementId: string) {
    let beingEditedElementHandler = this.taskHandlers.filter(function (obj) {
      return obj.beingEdited;
    });
    let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function (obj) {
      return obj.beingEdited;
    });
    if ((beingEditedElementHandler.length > 0 && beingEditedElementHandler[0].task.id !== elementId) || (beingEditedDataObjectHandler.length > 0 && beingEditedDataObjectHandler[0].dataObject.id !== elementId)) {
      return true;
    }
    return false;
  }

  // Create handler instance for each task / messageFlow of model
  createElementHandlerInstances(definitions: any) {
    for (let diagram of definitions.diagrams) {
      let element = diagram.plane.bpmnElement;
      if (element.$type === "bpmn:Process") {
        if (element.flowElements) {
          for (let node of element.flowElements.filter((e: any) => is(e, "bpmn:Task"))) {
            this.taskHandlers.push(new TaskHandler(this, node));
          }
          for (let node of element.flowElements.filter((e: any) => is(e, "bpmn:DataObjectReference"))) {
            this.dataObjectHandlers.push(new DataObjectHandler(this, node));
          }
        }
      } else {
        for (let participant of element.participants) {
          if (participant.processRef && participant.processRef.flowElements) {
            for (let node of participant.processRef.flowElements.filter((e: any) => is(e, "bpmn:Task"))) {
              this.taskHandlers.push(new TaskHandler(this, node));
            }
            for (let sprocess of participant.processRef.flowElements.filter((e: any) => is(e, "bpmn:SubProcess"))) {
              if (sprocess.flowElements) {
                for (let node of sprocess.flowElements.filter((e: any) => is(e, "bpmn:Task"))) {
                  this.taskHandlers.push(new TaskHandler(this, node));
                }
              }
            }
            for (let node of participant.processRef.flowElements.filter((e: any) => is(e, "bpmn:DataObjectReference"))) {
              this.dataObjectHandlers.push(new DataObjectHandler(this, node));
            }
          }
        }
      }
    }
  }

  prepareParser() {
    let self = this;
    return new Promise(() => {
      let result = this.pg_parser.parse("");
      if (!result.parse_tree.length) {
        self.parent.loaded = true;
      }
    });
  }

  updateModelContentVariable(xml: String) {
    // this.parent.newChanges = true;
    this.parent.updateModelContentVariable(xml);
    $('#analysis-results-panel-content').html('');
    $('#analysis-results-panel').hide();
  }

  // Get taskHandler instance of task by task id
  getTaskHandlerByTaskId(taskId: String) {
    let taskHandler = null;
    let taskHandlerWithTaskId = this.getAllModelTaskHandlers().filter(function (obj) {
      return obj.task.id == taskId;
    });
    if (taskHandlerWithTaskId.length > 0) {
      taskHandler = taskHandlerWithTaskId[0];
    }
    return taskHandler;
  }

  // Get taskHandler instance of task by task name
  getTaskHandlerByPreparedTaskName(name: String) {
    let taskHandler = null;
    let taskHandlerWithTaskId = this.getAllModelTaskHandlers().filter(function (obj) {
      return obj.task.name.trim().replace(/\s+/g, "_") == name;
    });
    if (taskHandlerWithTaskId.length > 0) {
      taskHandler = taskHandlerWithTaskId[0];
    }
    return taskHandler;
  }

  // Get all taskHandler instances of the model
  getAllModelTaskHandlers() {
    return this.taskHandlers;
  }

  // Get dataObjectHandler instance of dataObject by dataObject id
  getDataObjectHandlerByDataObjectId(dataObjectId: String) {
    let dataObjectHandler = null;
    let dataObjectHandlerWithMessageFlowId = this.getAllModelDataObjectHandlers().filter(function (obj) {
      return obj.dataObject.id == dataObjectId;
    });
    if (dataObjectHandlerWithMessageFlowId.length > 0) {
      dataObjectHandler = dataObjectHandlerWithMessageFlowId[0];
    }
    return dataObjectHandler;
  }

  // Get dataObjectHandler instance of dataObject by dataObject formatted name
  getDataObjectHandlerByPreparedDataObjectName(name: String) {
    let dataObjectHandler = null;
    let dataObjectHandlerWithMessageFlowId = this.getAllModelDataObjectHandlers().filter(function (obj) {
      return obj.dataObject.name.trim().replace(/ *\([^)]*\) */g, "").replace(/\s+/g, "_") == name;
    });
    if (dataObjectHandlerWithMessageFlowId.length > 0) {
      dataObjectHandler = dataObjectHandlerWithMessageFlowId[0];
    }
    return dataObjectHandler;
  }

  // Get all dataObjectHandler instances of the model
  getAllModelDataObjectHandlers() {
    return this.dataObjectHandlers;
  }

  // Check for unsaved changes on model
  areThereUnsavedChangesOnModel() {
    if (this.sensitiveAttributesHandler.areThereUnsavedChanges()) {
      return true;
    }
    let beingEditedElementHandler = this.taskHandlers.filter(function (obj) {
      return obj.beingEdited;
    });
    let beingEditedDataObjectHandler = this.dataObjectHandlers.filter(function (obj) {
      return obj.beingEdited;
    });
    if (beingEditedElementHandler.length > 0) {
      if (beingEditedElementHandler[0].areThereUnsavedTaskChanges()) {
        return true;
      }

    }
    if (beingEditedDataObjectHandler.length > 0) {
      if (beingEditedDataObjectHandler[0].areThereUnsavedDataObjectChanges()) {
        return true;
      }
    }
  }

}
