import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

import { AuthService } from '../auth/auth.service';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { EditorComponent } from './editor.component';

declare let $: any;

declare function require(name: string);

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
    let analysisPanels = $('.guessing-advantage-analysis-panels');
    analysisPanels.detach();
    $('.analysis-settings-container').prepend(analysisPanels);
    $('#sidebar').scrollTop(0);
    $('#analysis-panels').show();
    $('#analysis-panel').on('click', '#run-analysis', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let analysisPanels = $('.guessing-advantage-analysis-panels');
      analysisPanels.detach();
      $('.analysis-settings-container').prepend(analysisPanels);
      $('#analysis-results-panel').scrollTop(40);
      this.init();
      $('#analysis-results-panel').show();
      this.elementsHandler.propagationHandler.hidePropagationResultMessages();
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
            if (this.elementsHandler.getDataObjectHandlerByDataObjectId(inputId) && this.elementsHandler.getDataObjectHandlerByDataObjectId(inputId).getPreparedConstraints()) {
              constraints = constraints + this.elementsHandler.getDataObjectHandlerByDataObjectId(inputId).getPreparedConstraints() + '\n';
            }
          }
        }
      }
      fullQuery = query;
      this.analysisInput.queries += fullQuery + '\n\n';
      this.analysisInput.schemas += schemasQuery;
      this.analysisInput.attackerSettings += constraints;

      this.analysisInputTasksOrder.push({ id: taskId, order: Math.abs(counter - amount) });
      this.canvas.removeMarker(taskId, 'highlight-general-error');
      if (counter === 1) {
        if (this.analysisErrors.length === 0) {
          this.analysisInput.queries = this.analysisInput.queries.trim();
          this.analysisInput.epsilon = Number.parseFloat($('.advantage-input').val());
          this.analysisInput.beta = $('.beta-input').attr('disabled') ? -1 : Number.parseFloat($('.beta-input').val());
          if (Number.parseInt($('.allowed-queries').val()) <= 0) {
            $('.allowed-queries').val(1);
          }
          this.analysisInput.numberOfQueries = $('.allowed-queries').attr('disabled') ? 1 : Number.parseInt($('.allowed-queries').val());
          this.analysisInput.sensitiveAttributes = this.elementsHandler.sensitiveAttributesHandler.getSensitiveAttributes();

          this.analysisInput.errorUB = $('#estimated-noise-input').attr('disabled') ? 0.9 : Number.parseFloat($('#estimated-noise-input').val());
          this.analysisInput.sigmoidBeta = $('#sigmoid-smoothness-input').attr('disabled') ? -1 : Number.parseFloat($('#sigmoid-smoothness-input').val());
          this.analysisInput.sigmoidPrecision = $('#sigmoid-precision-input').attr('disabled') ? -1 : Number.parseFloat($('#sigmoid-precision-input').val());
          this.analysisInput.dateStyle = $('#datestyle-input').attr('disabled') ? -1 : $('#datestyle-input').val();

          $('.analysis-spinner').fadeIn();
          $('#analysis-results-panel-content').html('');

          const modelId = this.elementsHandler.parent.modelId;
          const modelName = $('#fileName').text().substring(0, $('#fileName').text().length - 5).trim().replace(' ', '_');
          const serverPetriFileName = modelId.trim() + '_' + modelName.trim();
          this.sendSqlCleanRequest(serverPetriFileName, this.analysisInput.schemas, this.analysisInput.queries, (cleanSql) => {
            if (cleanSql != "error") {
              this.analysisInput.queries = cleanSql;
              this.runAnalysisREST(this.analysisInput);
            } else {
              this.analysisResult = "Unable to analyse the model. Make sure the model and all input scripts are correct.";
              this.showAnalysisErrorResult();
            }
          });
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

  sendSqlCleanRequest(diagramId, schemas, queries, callback) {
    const apiURL = config.leakswhen.host + config.leakswhen.adapt;
    return this.editor.http.post(apiURL, { diagram_id: diagramId, sql_script: queries, sql_schema: schemas, target: "result" })
      .toPromise()
      .then(
        (res: any) => {
          let clean_sql = res.clean_sql;
          callback(clean_sql);
          return true;
        },
        err => {
          callback("error");
          return true;
        });
  }

  // Call to the analyser
  runAnalysisREST(postData: any) {
    this.editor.http.post(config.backend.host + '/rest/guessing-advantage/guessing-advantage-analysis', postData, AuthService.loadRequestOptions({ observe: 'response' })).subscribe(
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

      //the first four rows are visible immediately
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
                  <td style="text-align: left;"><strong>` + this.analysisResult[0] + `</strong></td>
                  <td>` + this.analysisResult[1] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>` + this.analysisResult[2] + `</strong></td>
                  <td>` + this.analysisResult[3] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>` + this.analysisResult[4] + `</strong></td>
                  <td>` + this.analysisResult[5] + `</td>
                </tr>
                <tr>
                  <td style="text-align: left;"><strong>` + this.analysisResult[6] + `</strong></td>
                  <td>` + this.analysisResult[7] + `</td>
                </tr>
              </tbody>
            </table>
            <div class="view-more-results-div" style="display:block;text-align:right;margin-top:10px;margin-bottom:10px"><span class="more-results-link">View more</span></div>
            <table style="width:100%;text-align:right;display:none" class="more-analysis-results">
              <tbody>`;

      //the remaining rows occur when "view more" is clicked
      for (let j = 8; j < this.analysisResult.length; j += 2) {
          resultsHtml += `
                <tr>
                  <td style="text-align: left;"><strong>` + this.analysisResult[j] + `</strong></td>
                  <td>` + this.analysisResult[j+1] + `</td>
                </tr>`;
      }

      resultsHtml += `
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
