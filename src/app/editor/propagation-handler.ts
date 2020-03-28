import * as Viewer from 'bpmn-js/lib/NavigatedViewer';

declare let $: any;

declare function require(name:string);
let config = require('../../config.json');

let is = (element, type) => element.$instanceOf(type);

export class PropagationHandler {

  constructor(viewer: Viewer, diagram: String, parent: any) {
    this.viewer = viewer;
    this.registry = this.viewer.get('elementRegistry');
    this.diagram = diagram;
    this.elementsHandler = parent;
    this.editor = parent.parent;
  }
    
  viewer: Viewer;
  registry: any;
  diagram: String;
    
  editor: any;
  elementsHandler: any;

  private taskDtoOrdering: any = {};

  initPropagation(): void {
    if ($('#sidebar').has('.propagation-results-container').length) {
      this.initPropagationResultsPanel();
    } else {
      $('.analysis-settings-container').prepend($('<div>').load(config.frontend.host + '/' + config.guessing_advantage_editor.folder + '/src/app/editor/templates/propagation-results-panel.html', () => {
        this.initPropagationResultsPanel();
      }));
    }
    
  }

  initPropagationResultsPanel(): void {
    this.hidePropagationResultMessages();
    $('.propagation-results').show();
    $('.propagation-spinner').fadeIn();
    let propagationPanel = $('.propagation-results-container');
    propagationPanel.detach();
    $('.analysis-settings-container').prepend(propagationPanel);
    $('#sidebar').scrollTop(0);
    $(document).off('click', '.propagation-results-hide-button');
    $(document).on('click', '.propagation-results-hide-button', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hidePropagationResultMessages();
    });
    this.runPropagation();
  }

  runPropagation(): void {
    this.runPropagationAnalysis((output) => {
      this.propagateIntermediates(output);
    });
  }

  showPropagationSuccess(): void {
    $('.propagation-spinner, .propagation-failure, .propagation-success').hide();
    $('.propagation-success').show();
  }

  showPropagationFailure(error: string): void {
    console.log(error);
    $('.propagation-spinner, .propagation-success, .propagation-failure').hide();
    $('.propagation-failure').show();
  }

  hidePropagationResultMessages(): void {
    $('.propagation-results, .propagation-spinner, .propagation-success, .propagation-failure').hide();
  }

  propagateIntermediates(propagationResponse: any): void {
    if (propagationResponse.commandError) {
      this.showPropagationFailure(propagationResponse.commandError);
      return;
    }
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
      }
    }
    this.setNewModelContentVariableContent();
    this.setChangesInModelStatus(true);
    this.showPropagationSuccess();
  }

  runPropagationAnalysis(callback) {
    let schemas = [];
    let queries = [];
    let tableDatas = [];
    let attackerSettings = [];
    let visitedNodes = [];
    let intermediates = [];
    let startBpmnEvents = [];

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

    const modelId = this.elementsHandler.parent.modelId;
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

          if (node.businessObject.sqlScript) {
            queries.push(node.businessObject.sqlScript);
          }

          schemas = schemas.concat(tempSchemas);
          attackerSettings = attackerSettings.concat(tempAttackerSettings);
        }
      }
    }

    this.elementsHandler.analysisHandler.sendSqlCleanRequest(serverPetriFileName, schemas.join('\n'), queries.join('\n'), (cleanSql) => {
      if (cleanSql != "error") {
        this.sendPropagationRequest(serverPetriFileName, JSON.stringify(petriNetArray), matcher, intermediates, schemas, queries, tableDatas, attackerSettings, cleanSql, (output) => callback(output));
      } else {
        this.showPropagationFailure("sql clean request error");
      }
    });
  }

  sendPropagationRequest(diagramId, petri, matcher, intermediates, schemas, queries, tableDatas, attackerSettings, cleanSql, callback) {
    let apiURL = config.backend.host + '/rest/sql-privacy/propagate';
    let petriURL = config.leakswhen.host + config.leakswhen.compute;

    return this.editor.http.post(petriURL, { diagram_id: diagramId, petri: petri })
      .toPromise()
      .then(
        (res: any) => {

          if (res.runs.length === 0) {
            this.showPropagationFailure("compute request error");
          }
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
                  this.showPropagationFailure("propagate request error");
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

  /* Wrapper functions to access elementHandler's functions */

  updateModelContentVariable(xml: String) {
    this.elementsHandler.updateModelContentVariable(xml);
  }

  /* Wrapper functions to access editor's functions */

  setChangesInModelStatus(status: boolean) {
    this.editor.setChangesInModelStatus(status);
  }

}