import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { AuthService } from '../auth/auth.service';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { EditorComponent } from './editor.component';

declare let $: any;

declare function require(name: string);

let is = (element, type) => element.$instanceOf(type);

let config = require('../../config.json');

export class AnalysisHandler {

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

  editor: EditorComponent;
  elementsHandler: any;

  analysisInput: any = {
    children: [],
    queries: '',
    epsilon: 0.3,
    beta: 0.1,
    schemas: '',
    attackerSettings: '',
    sensitiveAttributes: '',
    numberOfQueries: 1,
    errorUB: 0.9,
    sigmoidBeta: 0.000001,
    sigmoidPrecision: 5.0,
    dateStyle: 'European'
  };
  analysisResult: any = null;
  analysisInputTasksOrder: any = [];

  analysisErrors: any[] = [];
  numberOfErrorsInModel: Number = 0;

  private taskDtoOrdering: any = {};

  init() {
    if (this.elementsHandler.selectedTasks && this.elementsHandler.selectedTasks.length === 0) {
      this.analysisResult = 'Please select at least one task to run the analysis.';
      this.showAnalysisErrorResult();
      return;
    }

    // No changes in model, so show previous analysis results
    if (!this.getChangesInModelStatus() &&
      Number.parseFloat(this.analysisInput.epsilon) == Number.parseFloat($('.advantage-input').val()) &&
      Number.parseFloat(this.analysisInput.beta) == Number.parseFloat($('.beta-input').val()) &&
      // this.analysisInput.attackerSettings == this.elementsHandler.attackerSettingsHandler.getAttackerSettings() &&
      this.analysisInput.sensitiveAttributes == this.elementsHandler.sensitiveAttributesHandler.getSensitiveAttributes() &&
      Number.parseInt(this.analysisInput.numberOfQueries) == Number.parseInt($('.allowed-queries').val()) &&
      Number.parseFloat(this.analysisInput.errorUB) == Number.parseFloat($('#estimated-noise-input').val()) &&
      Number.parseFloat(this.analysisInput.sigmoidBeta) == Number.parseFloat($('#sigmoid-smoothness-input').val()) &&
      Number.parseFloat(this.analysisInput.sigmoidPrecision) == Number.parseFloat($('#sigmoid-precision-input').val()) &&
      this.analysisInput.dateStyle == $('#datestyle-input').val()
    ) {
      this.showAnalysisResults();
      return;
    }

    // Changes in model, so run new analysis
    this.analysisInput = {
      children: [],
      queries: '',
      epsilon: 0.3,
      beta: 0.1,
      schemas: '',
      attackerSettings: '',
      sensitiveAttributes: '',
      numberOfQueries: 1,
      errorUB: 0.9,
      sigmoidBeta: 0.000001,
      sigmoidPrecision: 5.0,
      dateStyle: 'European'
    };

    let selectedTasks = this.elementsHandler.selectedTasks;
    let counter = selectedTasks.length; // this.getAllModelTaskHandlers().length;
    this.analysisErrors = [];
    // for (let taskId of this.getAllModelTaskHandlers().map(a => a.task.id)) {
    for (let taskId of selectedTasks.map(t => t.id)) {
      this.prepareTaskAnalyzerInput(taskId, counter--, selectedTasks.length);
    }
    this.eventBus.on('element.click', () => {
      this.removeErrorHiglights();
    });
  }

  loadAnalysisPanelTemplate() {
    if ($('#sidebar').has('#analysis-panel').length) {
      this.initAnalysisPanels();
    } else {
      $('.analysis-settings-container').prepend($('<div>').load(config.frontend.host + '/' + config.guessing_advantage_editor.folder + '/src/app/editor/templates/analysis-panels.html', () => {
        this.initAnalysisPanels();
      }));
    }
  }

  initAnalysisPanels() {
    $('#analysis-panel').off('click', '#run-analysis');
    let analysisPanels = $('#analysis-panels');
    analysisPanels.detach();
    $('.analysis-settings-container').prepend(analysisPanels);
    $('#sidebar').scrollTop(0);
    $('#analysis-panels').show();
    $('#analysis-panel').on('click', '#run-analysis', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let analysisPanels = $('#analysis-panels');
      analysisPanels.detach();
      $('.analysis-settings-container').prepend(analysisPanels);
      $('#sidebar').scrollTop(0);
      this.init();
      $('#analysis-results-panel').show();
    });
    $('.beta-toggle').bootstrapToggle();
    $('.beta-toggle').change(() => {
      $('.beta-input').toggle();
      if (!$('.beta-toggle').prop('checked')) {
        $('.beta-input').val(-1);
      } else {
        $('.beta-input').val(0.1);
      }
    });
    $('.beta-toggle').bootstrapToggle('disable');
    $('#analysis-panel').on('click', '#analysis-settings-hide-button', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.removeErrorHiglights();
      $('#analysis-panels').hide();
    });
    $(document).find('#attacker-advantage-input').on('input', () => {
      let percent = Math.round($('#attacker-advantage-input').val() * 100);
      $('#analysis-panel').find('#attacker-advantage-label').text(percent);
    });
    $(document).find('#estimated-noise-input').on('input', () => {
      let percent = Math.round($('#estimated-noise-input').val() * 100);
      $('#analysis-panel').find('#estimated-noise-label').text(percent);
    });
    $('#analysis-panel').on('click', '#sensitive-attributes-button', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.elementsHandler.sensitiveAttributesHandler.initSensitiveAttributesEditProcess();
    });

    $('#analysis-panel').on('click', '#disable-advanced-settings', (event) => {
      $('#advanced-settings').find('input').attr('disabled', true);
      $('.beta-input').val(-1);
      $('.beta-toggle').bootstrapToggle('disable');
      $('#advanced-settings').css('opacity', '0.4');
      $(event.target).hide();
      $('#enable-advanced-settings').show();
      this.setChangesInModelStatus(true);
    });

    $('#analysis-panel').on('click', '#enable-advanced-settings', (event) => {
      $('#advanced-settings').find('input').attr('disabled', false);
      $('.beta-input').val(0.1);
      $('.beta-toggle').bootstrapToggle('enable');
      $('#advanced-settings').css('opacity', '1');
      $(event.target).hide();
      $('#disable-advanced-settings').show();
      this.setChangesInModelStatus(true);
    });
  }

  // Format analyser input and send it to the analyser
  prepareTaskAnalyzerInput(taskId: string, counter: number, amount: number) {
    const task = this.getTaskHandlerByTaskId(taskId);
    const taskQuery = task.getPreparedQuery();
    // let taskSchema = task.getPreparedSchema();
    if (taskQuery && taskQuery.success) {
      let taskName = null;
      // let taskSchemaCmd = '';
      // if (taskSchema && taskSchema.success) {
      //   taskName = taskSchema.success.tableName;
      //   taskSchemaCmd = taskSchema.success.schema;
      // } else {
      taskName = taskQuery.success.taskName;
      // }
      let query = taskQuery.success.query;
      let fullQuery = '';
      let inputIds = task.getTaskInputObjects().map(a => a.id);
      let schemasQuery = '';
      let constraints = '';
      for (let inputId of inputIds) {
        let dataObjectQueries = this.getPreparedQueriesOfDataObjectByDataObjectId(inputId);
        if (dataObjectQueries) {
          let alreadyAddedDataObject = this.analysisInput.children.filter(function (obj) {
            return obj.id == inputId;
          });
          if (alreadyAddedDataObject.length === 0) {
            this.analysisInput.children.push(dataObjectQueries);
            if (dataObjectQueries.schema) {
              let schema = dataObjectQueries.schema + '\n';
              schemasQuery += schema;
            }
            constraints += this.elementsHandler.getDataObjectHandlerByDataObjectId(inputId).getPreparedConstraints() + '\n';
          }
        }
      }
      fullQuery = query; // query.toLowerCase().indexOf('insert into') === -1 ? 'INSERT INTO ' + taskName + ' ' + query : query;
      // fullQuery = 'INSERT INTO ' + taskName + ' ' + query;
      this.analysisInput.queries += fullQuery + '\n\n';
      this.analysisInput.schemas += schemasQuery;
      this.analysisInputTasksOrder.push({ id: taskId, order: Math.abs(counter - amount) });
      this.canvas.removeMarker(taskId, 'highlight-general-error');
      if (counter === 1) {
        if (this.analysisErrors.length === 0) {
          this.analysisInput.queries.trim();
          this.analysisInput.epsilon = Number.parseFloat($('.advantage-input').val());
          this.analysisInput.beta = $('.beta-input').attr('disabled') ? -1 : Number.parseFloat($('.beta-input').val());
          if (Number.parseInt($('.allowed-queries').val()) <= 0) {
            $('.allowed-queries').val(1);
          }
          this.analysisInput.numberOfQueries = $('.allowed-queries').attr('disabled') ? 1 : Number.parseInt($('.allowed-queries').val());
          this.analysisInput.attackerSettings = constraints; // this.elementsHandler.attackerSettingsHandler.getAttackerSettings();
          this.analysisInput.sensitiveAttributes = this.elementsHandler.sensitiveAttributesHandler.getSensitiveAttributes();

          this.analysisInput.errorUB = $('#estimated-noise-input').attr('disabled') ? -1 : Number.parseFloat($('#estimated-noise-input').val());
          this.analysisInput.sigmoidBeta = $('#sigmoid-smoothness-input').attr('disabled') ? -1 : Number.parseFloat($('#sigmoid-smoothness-input').val());
          this.analysisInput.sigmoidPrecision = $('#sigmoid-precision-input').attr('disabled') ? -1 : Number.parseFloat($('#sigmoid-precision-input').val());
          this.analysisInput.dateStyle = $('#datestyle-input').attr('disabled') ? -1 : $('#datestyle-input').val();

          $('.analysis-spinner').fadeIn();
          $('#analysis-results-panel-content').html('');
          this.runAnalysisREST(this.analysisInput);
        } else {
          this.showAnalysisErrorResults();
        }
      }
    } else {
      this.addUniqueErrorToErrorsList(taskQuery.error, [taskId]);
      if (counter === 1) {
        this.showAnalysisErrorResults();
      }
    }
  }

  // Call to the analyser
  runAnalysisREST(postData: any) {
    this.editor.http.post(config.backend.host + '/rest/sql-privacy/analyze-guessing-advantage', postData, AuthService.loadRequestOptions({ observe: 'response' })).subscribe(
      success => {
        this.formatAnalysisResults(success);
      },
      fail => {
        this.formatAnalysisErrorResults(fail);
      }
    );
  }

  // Format analysis result string
  formatAnalysisResults(success: HttpResponse<any>) {
    if (success.status === 200) {
      let resultsString = success.body.result;
      if (resultsString) {
        let lines = resultsString.split(String.fromCharCode(30));
        this.analysisResult = lines;
        this.setChangesInModelStatus(false);
        this.showAnalysisResults();
      }
    }
  }

  // Format analysis error string
  formatAnalysisErrorResults(fail: HttpErrorResponse) {
    if (fail.status === 409) {
      this.analysisResult = fail.error.error;
      this.analysisResult = this.analysisResult.replace('WARNING:  there is no transaction in progress', '');
    } else if (fail.status === 400) {
      this.analysisResult = 'Analyzer error';
    } else {
      this.analysisResult = 'Server error';
    }
    this.showAnalysisErrorResult();
  }

  // Show analysis results table
  showAnalysisResults() {
    if (this.analysisResult) {
      let resultsHtml = '';

      resultsHtml += `
      <div class="" id="general-analysis-results">
        <div class="panel panel-default">
          <div class="panel-heading" style="background-color:#ddd">
          <b><span style="font-size: 16px; color: #666">summary</span></b>
          </div>
          <div class="panel-body">
            <table style="width:100%;text-align:right">
              <tbody>
                <tr>
                  <td style="text-align: left;"><strong>actual outputs y</strong></td>
                  <td>` + this.analysisResult[0] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>` + Math.round(this.analysisInput.errorUB * 100) + `%-noise magnitude a</strong></td>
                  <td>` + this.analysisResult[1] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>` + Math.round(this.analysisInput.errorUB * 100) + `%-realtive error |a|/|y|</strong></td>
                  <td>` + this.analysisResult[2] + `</td>
                </tr>
              </tbody>
            </table>
            <div class="view-more-results-div" style="display:block;text-align:right;margin-top:10px;margin-bottom:10px"><span class="more-results-link">View more</span></div>
            <table style="width:100%;text-align:right;display:none" class="more-analysis-results">
              <tbody>
                <tr>
                  <td style="text-align: left;"><strong>Cauchy (default) distribution</strong></td>
                  <td>` + this.analysisResult[3] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>prior (worst instance)</strong></td>
                  <td>` + this.analysisResult[4] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>posterior (worst instance)</strong></td>
                  <td>` + this.analysisResult[5] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>DP epsilon</strong></td>
                  <td>` + this.analysisResult[6] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>smoothness beta</strong></td>
                  <td>` + this.analysisResult[7] + `</td>
                </tr>
                 <tr>
                  <td style="text-align: left;"><strong>(epsilon,delta) for Laplace noise</strong></td>
                  <td>` + this.analysisResult[8] + `</td>
                </tr>
                 <tr>
                  <td style="text-align: left;"><strong>norm N</strong></td>
                  <td>` + this.analysisResult[9] + `</td>
                </tr>
                 <tr>
                  <td style="text-align: left;"><strong>beta-smooth sensitivity</strong></td>
                  <td>` + this.analysisResult[10] + `</td>
                </tr>
                 <tr>
                  <td style="text-align: left;"><strong>` + Math.round(this.analysisInput.errorUB * 100) + `%-noise magnitude (Laplace)</strong></td>
                  <td>` + this.analysisResult[11] + `</td>
                </tr>
                 <tr>
                  <td style="text-align: left;"><strong>` + Math.round(this.analysisInput.errorUB * 100) + `%-realtive error (Laplace)</strong></td>
                  <td>` + this.analysisResult[12] + `</td>
                </tr>
                 <tr>
                  <td style="text-align: left;"><strong>Laplace noise distribution</strong></td>
                  <td>` + this.analysisResult[13] + `</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

      $('.analysis-spinner').hide();
      $('#analysis-results-panel-content').html(resultsHtml);
      $('#analysis-results-panel-content').on('click', '.more-results-link', (e) => {
        $('.more-analysis-results').show();
        $('.view-more-results-div').hide();
      });
    }
  }

  // Show analysis errors list
  showAnalysisErrorResults() {
    $('#analysis-results-panel-content').html('');
    this.removeErrorHiglights();
    this.removeErrorsListClickHandlers();
    this.numberOfErrorsInModel = 0;
    if (this.analysisErrors.length > 0) {
      this.numberOfErrorsInModel = this.analysisErrors.length;
      let errors_list = '<ol style="text-align:left">';
      let i = 0;
      for (let error of this.analysisErrors) {
        let errorMsg = error.error.charAt(0).toUpperCase() + error.error.slice(1);
        errors_list += '<li class="error-list-element error-' + i + '" style="font-size:16px; color:darkred; cursor:pointer;">' + errorMsg + '</li>';
        $('#analysis-results-panel-content').on('click', '.error-' + i, (e) => {
          this.highlightObjectWithErrorByIds(error.object);
          $(e.target).css('font-weight', 'bold');
        });
        i++;
      }
      errors_list += '</ol>';
      $('.analysis-spinner').hide();
      $('#analysis-results-panel-content').html(errors_list);
    }
  }

  // Show one error from analyzer
  showAnalysisErrorResult() {
    let resultsHtml = '<div style="text-align:left; word-break: break-word; white-space: pre-wrap;"><font style="color:darkred"><span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span> ' + this.analysisResult + '</font></div>';
    $('.analysis-spinner').hide();
    $('#analysis-results-panel-content').html(resultsHtml);
  }

  // Add unique error to errors list
  addUniqueErrorToErrorsList(error: String, ids: String[]) {
    let errors = this.analysisErrors;
    let sameErrorMsgs = errors.filter(function (obj) {
      return obj.error == error && obj.object.toString() === ids.toString();
    });
    if (sameErrorMsgs.length === 0) {
      errors.push({ error: error, object: ids });
    }
  }

  // Remove click handlers of error links in errors list
  removeErrorsListClickHandlers() {
    for (let j = 0; j < this.numberOfErrorsInModel; j++) {
      $('#analysis-results-panel-content').off('click', '.error-' + j);
    }
  }

  // Highlight objects with stereotype errors by ids
  highlightObjectWithErrorByIds(generalIds: String[]) {
    this.removeErrorHiglights();
    for (let id of generalIds) {
      this.canvas.addMarker(id, 'highlight-general-error');
    }
  }

  // Remove error highlights
  removeErrorHiglights() {
    $('.error-list-element').css('font-weight', '');
    for (let taskHandler of this.getAllModelTaskHandlers()) {
      this.canvas.removeMarker(taskHandler.task.id, 'highlight-general-error');
    }
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

  // START Propagation

  propagateIntermediates(propagationResponse: any): void {
    console.log("success");
    for (var i in this.registry._elements) {
      var node = this.registry._elements[i].element;

      if (node.type == "bpmn:DataObjectReference" || node.type == "bpmn:DataStoreReference") {
        for (var tab in propagationResponse.tableSchemas) {
          if (tab == node.businessObject.id) {
            node.businessObject.sqlScript = propagationResponse.tableSchemas[tab];
            if (node.businessObject.sqlDataObjectInfo != null) {
              let savedData = JSON.parse(node.businessObject.sqlDataObjectInfo);
              savedData.inputDB = propagationResponse.tableDatas[tab];
              node.businessObject.sqlDataObjectInfo = JSON.stringify(savedData);
            } else {
              node.businessObject.sqlDataObjectInfo = JSON.stringify({ inputNRM: "", inputDB: propagationResponse.tableDatas[tab], inputConstraints: "" });
            }
            node.businessObject.isPropagated = true;
          }
        }
        for (var tab in propagationResponse.tableConstraints) {
          if (node.businessObject.name.split(' ').map(word => word.toLowerCase()).join('_') == tab.substring(0, tab.length - 4)) {
            if (node.businessObject.sqlDataObjectInfo != null) {
              let savedData = JSON.parse(node.businessObject.sqlDataObjectInfo);
              savedData.inputConstraints = propagationResponse.tableConstraints[tab];
              node.businessObject.sqlDataObjectInfo = JSON.stringify(savedData);
            } else {
              node.businessObject.sqlDataObjectInfo = JSON.stringify({ inputNRM: "", inputDB: "", inputConstraints: propagationResponse.tableConstraints[tab] });
            }
            node.businessObject.isPropagated = true;
          }
        }
        if (propagationResponse.commandError) {
          console.log("propagation error");
          console.log(propagationResponse.commandError);
          // $('#propServerError').show();
          // $('#propServerError').text(propagationResponse.commandError);
        } else {
          // $('#propServerError').hide();
        }
      }
    }
    $('.propagation-spinner').hide();
    alert("propagation successful");
    this.setNewModelContentVariableContent();
    this.setChangesInModelStatus(true);
  }

  runPropagationAnalysis(callback) {
    let schemas = [];
    let queries = [];
    let tableDatas = [];
    let attackerSettings = [];
    let visitedNodes = [];
    let intermediates = [];
    let startBpmnEvents = [];

    $('.propagation-spinner').fadeIn();

    for (let i in this.registry._elements) {
      if (this.registry._elements[i].element.type == "bpmn:StartEvent") {
        startBpmnEvents.push(this.registry._elements[i].element.businessObject);
      }
    }

    let petriNet = {};
    let maxPlaceNumberObj = { maxPlaceNumber: 0 };

    this.removePetriMarks();

    // For multiple lanes we have multiple start events
    for (let i = 0; i < startBpmnEvents.length; i++) {
      petriNet = this.buildPetriNet(startBpmnEvents[i], petriNet, maxPlaceNumberObj, this.taskDtoOrdering);
    }

    this.preparePetriNetForServer(petriNet);

    let matcher = {};
    Object.keys(petriNet).forEach(k => {
      petriNet[k]["id"] = k;

      let obj = this.registry.get(k);
      if (!!obj && obj.businessObject.sqlScript) {
        matcher[k] = obj.businessObject.sqlScript;
      }
    });
    let petriNetArray = Object.values(petriNet);
    this.removePetriMarks();

    const modelId = this.elementsHandler.parent.modelId; // TODO - get it somehow else?
    const modelName = $('#fileName').text().substring(0, $('#fileName').text().length - 5).trim().replace(' ', '_');

    const serverPetriFileName = modelId.trim() + '_' + modelName.trim();

    for (var i in this.registry._elements) {
      var node = this.registry._elements[i].element;

      if (is(node.businessObject, 'bpmn:Task') || is(node.businessObject, 'bpmn:IntermediateCatchEvent') ||
        is(node.businessObject, 'bpmn:StartEvent')) {
        if (node.businessObject.dataOutputAssociations) {
          node.businessObject.dataOutputAssociations.forEach(x => {
            if (!x.targetRef.sqlScript) {
              intermediates.push([x.targetRef.name, x.targetRef.id]);
            }
          });
        }
      }

      if (is(node.businessObject, 'bpmn:Task')) {
        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          let tempSchemas = [];
          let tempAttackerSettings = [];

          if (node.businessObject.dataInputAssociations) {
            node.businessObject.dataInputAssociations.forEach(x => {
              if (!visitedNodes.includes(x.sourceRef[0].id)) {
                visitedNodes.push(x.sourceRef[0].id);

                let tableName = x.sourceRef[0].name ? x.sourceRef[0].name.toLowerCase().replace(' ', '_') : "undefined";

                let inputSchema = "";
                if (x.sourceRef[0].sqlScript != null) {
                  inputSchema = x.sourceRef[0].sqlScript;
                }
                if (inputSchema.length === 0) {
                  if (x.sourceRef[0].sqlDataObjectInfo != null) {
                    let savedData = JSON.parse(x.sourceRef[0].sqlDataObjectInfo);
                    if (savedData && savedData.inputSchema) {
                      inputSchema = savedData.inputSchema;
                    }
                  }
                }

                if (inputSchema && inputSchema.length > 0) {
                  tempSchemas.push(inputSchema);
                }

                let inputConstraints = "";
                if (x.sourceRef[0].sqlDataObjectInfo != null) {
                  let savedData = JSON.parse(x.sourceRef[0].sqlDataObjectInfo);
                  inputConstraints = savedData.inputConstraints;
                }
                if (!inputConstraints || inputConstraints.length === 0) {
                  if (x.sourceRef[0].attackerSettings != null) {
                    inputConstraints = x.sourceRef[0].attackerSettings;
                  }
                }
                if (inputConstraints && inputConstraints.length > 0) {
                  inputConstraints = inputConstraints.split('\n').join(`\n${tableName}.`);
                  inputConstraints = `${tableName}.${inputConstraints}`;
                  tempAttackerSettings.push(inputConstraints);
                }

                let inputDB = ""
                if (x.sourceRef[0].sqlDataObjectInfo != null) {
                  let savedData = JSON.parse(x.sourceRef[0].sqlDataObjectInfo);
                  inputDB = savedData.inputDB;
                }
                if (!inputDB || inputDB.length === 0) {
                  if (x.sourceRef[0].tableData != null) {
                    inputDB = x.sourceRef[0].tableData;
                  }
                }

                if (!!inputDB) {
                  tableDatas.push({ name: tableName, db: this.getPreparedQueries(inputDB) });
                }
              }
            });
          }

          if (node.businessObject.sqlScript)
            queries.push(node.businessObject.sqlScript);

          schemas = schemas.concat(tempSchemas);
          attackerSettings = attackerSettings.concat(tempAttackerSettings);
        }
      }
    }

    this.sendSqlCleanRequest(serverPetriFileName, schemas, queries, (cleanSql) => {
      this.sendPropagationRequest(serverPetriFileName, JSON.stringify(petriNetArray), matcher, intermediates, schemas, queries, tableDatas, attackerSettings, cleanSql, (output) => callback(output));
    });
  }

  sendSqlCleanRequest(diagramId, schemas, queries, callback) {
    const apiURL = config.leakswhen.host + config.leakswhen.adapt;
    return this.editor.http.post(apiURL, { diagram_id: diagramId, sql_script: queries.join('\n'), sql_schema: schemas.join('\n'), target: "result" })
      .toPromise()
      .then(
        (res: any) => {
          let clean_sql = res.clean_sql;
          callback(clean_sql);
          return true;
        },
        err => {
          console.log("sql clean request error");
          // $('#leaksWhenServerError').show();
          // $('#analysis-results-panel').hide();
          // $('.analysis-spinner').hide();
          return true;
        });
  }

  sendPropagationRequest(diagramId, petri, matcher, intermediates, schemas, queries, tableDatas, attackerSettings, cleanSql, callback) {
    let apiURL = config.backend.host + '/rest/sql-privacy/propagate';
    let petriURL = config.leakswhen.host + config.leakswhen.compute;

    return this.editor.http.post(petriURL, { diagram_id: diagramId, petri: petri })
      .toPromise()
      .then(
        (res: any) => {
          let runs = res.runs;

          runs = runs.filter(run => {
            return run.reduce((acc, cur) => { return acc || cur.includes('EndEvent') }, false);
          });

          return runs.reduce((acc, run, runNumber) => acc.then(res => {
            let sqlCommands = run.map((id) => matcher[id]).filter(x => !!x);

            return this.editor.http.post(apiURL, {
              modelName: "testus2",
              intermediates: intermediates.map(arr => [arr[0].split(" ").map(word => word.toLowerCase()).join("_"), arr[1]]),
              allQueries: sqlCommands,
              numberOfQueries: queries.length, schemas: schemas.join('\n'),
              queries: queries.join('\n'),
              children: tableDatas,
              cleanSql: cleanSql,
              attackerSettings: attackerSettings.join('\n'),
              errorUB: 0.9,
              sigmoidBeta: 0.000001,
              sigmoidPrecision: 5.0,
              dateStyle: "European"
            })
              .toPromise()
              .then(
                (res: any) => {
                  callback(res);
                  return true;
                },
                err => {
                  console.log("propagate request error");
                  // $('#leaksWhenServerError').show();
                  // $('#analysis-results-panel').hide();
                  // $('.analysis-spinner').hide();
                  return true;
                });
          }), Promise.resolve());
        });
  }

  getPreparedQueries(tableData) {
    const inputDB = tableData; // JSON.parse(tableData);

    if (inputDB) {
      let DBOutput = '';
      for (const row of inputDB) {
        for (const col of row) {
          DBOutput += col + ' ';
        }
        DBOutput = DBOutput.trim() + '\n';
      }
      DBOutput = DBOutput.trim();
      return DBOutput;
    }
  }

  // To refresh the state of diagram and be able to run analyser again
  removePetriMarks(): void {
    for (var i in this.registry._elements) {
      var node = this.registry._elements[i].element;
      if (node['petriPlace']) {
        delete node['petriPlace'];
      }
      if (node['isProcessed']) {
        delete node['isProcessed'];
      }
      if (node['stackImage']) {
        delete node['stackImage'];
      }
      if (!!node.businessObject) {
        if (node.businessObject['petriPlace']) {
          delete node.businessObject['petriPlace'];
        }
        if (node.businessObject['isProcessed']) {
          delete node.businessObject['isProcessed'];
        }
        if (node.businessObject['stackImage']) {
          delete node.businessObject['stackImage'];
        }
      }
    }
  }

  buildPetriNet(startBusinessObj, petri, maxPlaceNumberObj, taskDtoOrdering): any {
    let currentRun = [];
    let st = [startBusinessObj];
    let xorSplitStack = [];

    while (st.length > 0) {
      let curr = st.pop();
      currentRun.push(curr);

      let inc = curr.incoming ? curr.incoming.map(x => x.sourceRef) : null;
      let out = curr.outgoing ? curr.outgoing.map(x => x.targetRef) : null;

      if (curr.outgoing && curr.$type != "bpmn:DataObjectReference") {
        curr.outgoing.forEach(x => {
          var name = curr.id;
          if (!is(curr, 'bpmn:StartEvent')) {
            name = x.petriPlace ? x.petriPlace : "p" + maxPlaceNumberObj.maxPlaceNumber++;
          }

          if (is(x.targetRef, 'bpmn:EndEvent')) {
            name = x.targetRef.id;
          }

          x.petriPlace = name;

          if (!petri[name]) {
            petri[name] = { out: [], type: "place" };
          }
        });
      }

      if (curr.$type == "bpmn:DataObjectReference") {
        petri[curr.id] = {
          out: out.length ? out.map(x => x.id) : [],
          type: "place"
        };
      }

      if (curr.outgoing && curr.incoming && !curr.isProcessed) {
        var ident = curr.id;
        if (curr.$type == "bpmn:ParallelGateway") {
          ident = ident.replace("Exclusive", "Parallel");
        }

        if (!petri[ident]) {
          petri[ident] = {
            out: curr.outgoing.map(x => x.petriPlace),
            type: "transition"
          };
        }
        else {
          petri[ident].out = petri[ident].out.concat(curr.outgoing.map(x => x.petriPlace));
        }

        curr.incoming.forEach(x => {
          if (x.petriPlace && !petri[x.petriPlace].out.find(z => z == ident)) {
            petri[x.petriPlace].out.push(ident);
          }
        });

        curr.isProcessed = curr.incoming.reduce((acc, cur) => {
          return acc && !!cur.petriPlace;
        }, true);
      }

      var isAllPredecessorsInRun = !inc || inc.reduce((acc, cur) => acc && !!currentRun.find(x => x == cur), true);
      if (isAllPredecessorsInRun || curr.$type == 'bpmn:ExclusiveGateway' && out.length == 1 ||
        curr.$type == 'bpmn:EndEvent') {
        if (!!curr.stackImage) {
          // Cycle check
          continue;
        }
        if (curr.$type == 'bpmn:ExclusiveGateway' && inc.length == 1) {
          curr.stackImage = st.slice();
          xorSplitStack.push(curr);
          out.forEach(x => st.push(x));
        }
        else {
          if (curr.$type != 'bpmn:EndEvent') {
            out.forEach(x => st.push(x));
          }
        }
      }
    }

    // Data Objects handling
    for (var i in this.registry._elements) {
      var node = this.registry._elements[i].element;
      if ((is(node.businessObject, 'bpmn:Task') || is(node.businessObject, 'bpmn:IntermediateCatchEvent')) && petri[node.id]) {
        taskDtoOrdering[node.id] = [];
        petri[node.id].label = node.businessObject.name;

        if (node.businessObject.dataInputAssociations && node.businessObject.dataInputAssociations.length) {
          node.businessObject.dataInputAssociations.forEach(x => {
            // We attach initial data objects with 'create' statements to the first
            // task of current lane and ignore if there are multiple output associations
            // because of petri net logic
            var isFoundInputForDTO = false;
            for (var j in this.registry._elements) {
              var node2 = this.registry._elements[j].element;
              if (is(node2.businessObject, 'bpmn:Task') || is(node2.businessObject, 'bpmn:IntermediateCatchEvent')) {
                if (node2.businessObject.dataOutputAssociations && node2.businessObject.dataOutputAssociations.length) {
                  node2.businessObject.dataOutputAssociations.forEach(y => {
                    if (y.targetRef.id == x.sourceRef[0].id) {
                      isFoundInputForDTO = true;
                    }
                  });
                }
              }
            }

            if (!!x.sourceRef[0].sqlScript && !x.sourceRef[0].isPropagated && !isFoundInputForDTO && x.sourceRef[0].$parent.id == startBusinessObj.$parent.id) {
              let startEventOut = startBusinessObj.outgoing ? startBusinessObj.outgoing.map(x => x.targetRef) : null;
              if (!!startEventOut) {
                petri[x.sourceRef[0].id] = { type: "place", out: [startEventOut[0].id], label: x.sourceRef[0].name }
              }
            }
          });
        }

        if (node.businessObject.dataOutputAssociations && node.businessObject.dataOutputAssociations.length) {
          node.businessObject.dataOutputAssociations.forEach(x => {
            if (!!x.targetRef.sqlScript && !x.targetRef.isPropagated) {
              if (petri[node.id].out.findIndex(y => y == x.targetRef.id) == -1) {
                petri[node.id].out.push(x.targetRef.id);
              }
              if (!petri[x.targetRef.id]) {
                petri[x.targetRef.id] = { type: "place", out: [], label: x.targetRef.name }
              }
            }

            taskDtoOrdering[node.id].push(x.targetRef.id);
          });
        }
      }
    }

    // Handling message flow
    for (var i in this.registry._elements) {
      var node = this.registry._elements[i].element;
      if (node.type == "bpmn:MessageFlow" && !node.isProcessed) {
        var source = node.businessObject.sourceRef;
        var target = node.businessObject.targetRef;

        // New place for message flow
        var newId = "";
        // In case of message flow to start event in another lane
        // we don't need a new place, because start event is already a place
        if (is(target, 'bpmn:StartEvent')) {
          newId = target.id;
        }
        else {
          newId = "p" + maxPlaceNumberObj.maxPlaceNumber++;
          petri[newId] = { type: "place", out: [target.id], label: newId }
        }

        if (!petri[source.id]) {
          petri[source.id] = { type: "transition", out: [newId], label: source.name }
        }
        else {
          petri[source.id].out.push(newId);
        }

        node.isProcessed = true;
      }
    }

    return petri;
  }

  preparePetriNetForServer(petriNet: any): void {
    function onlyUnique(value, index, self) {
      return self.indexOf(value) === index;
    }

    for (var el in petriNet) {
      petriNet[el].out = petriNet[el].out.filter(onlyUnique);
    }

    // Removing redundant nodes before/after xor gateway 
    // (because XOR state is not carrying logic so we can connect preceeding node directly to the following)
    for (var el in petriNet) {
      if (el.includes("ExclusiveGateway")) {

        if (petriNet[el].out.length > 1) {

          var preceedingNode = Object.values(petriNet).find(x => !!x["out"].find(z => z == el));
          preceedingNode["out"] = [];
          for (var i = 0; i < petriNet[el].out.length; i++) {
            var copy = el + i;
            preceedingNode["out"].push(copy);
            petriNet[copy] = { type: petriNet[el].type, out: [petriNet[el].out[i]] };
          }
        }
        else {
          var preceedings = Object.values(petriNet).filter(x => !!x["out"].find(z => z == el));
          for (var i = 0; i < preceedings.length; i++) {
            var copy = el + i;
            preceedings[i]["out"] = [copy];
            petriNet[copy] = { type: petriNet[el].type, out: [petriNet[el].out[0]] };
          }
        }

        delete petriNet[el];

      }
    }

    // Additional data for server analyzer
    for (var el in petriNet) {
      if (petriNet[el].type == "place") {
        var isInputFound = false;
        for (var el2 in petriNet) {
          if (petriNet[el2].out.findIndex(x => x == el) != -1) {
            isInputFound = true;
            break;
          }
        }

        petriNet[el].isInputFound = isInputFound;
      }
    }

  }


  // END Propagation

  /* Wrapper functions to access elementHandler's functions */

  getTaskHandlerByTaskId(taskId: string) {
    return this.elementsHandler.getTaskHandlerByTaskId(taskId);
  }

  getPreparedQueriesOfDataObjectByDataObjectId(dataObjectId: string) {
    return this.elementsHandler.getDataObjectHandlerByDataObjectId(dataObjectId).getPreparedQueries();
  }

  getTaskHandlerByPreparedTaskName(preparedName: string) {
    return this.elementsHandler.getTaskHandlerByPreparedTaskName(preparedName);
  }

  getAllModelTaskHandlers() {
    return this.elementsHandler.getAllModelTaskHandlers();
  }

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

  /* Wrapper functions to access editor's functions */

  getChangesInModelStatus() {
    return this.editor.getChangesInModelStatus();
  }

  setChangesInModelStatus(status: boolean) {
    this.editor.setChangesInModelStatus(status);
  }

}
