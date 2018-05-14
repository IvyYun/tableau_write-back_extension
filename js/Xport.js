'use strict';

(function () {

  let unregisterEventHandlerFunction;
  let dataTable;
  let datacolumns;
  let xportType;
  let extensionSettings;
  let xportConfigColumns;

  // Use the jQuery document ready signal to know when everything has been initialized
  $(document).ready(function () {
    
    var browser = DevTools.get_browser();
    console.log("Tableau Browser: "+ browser.name +" "+browser.version);

    tableau.extensions.initializeAsync({ 'configure': configure }).then(function () {
      $('[data-toggle="tooltip"]').tooltip();
      
      // Get all Extension Settings
      let settings = tableau.extensions.settings.get('xpanditWritebackSettings');
      extensionSettings = settings ? JSON.parse(settings) : {};
      console.log("Settings: %O", extensionSettings);
      xportType = extensionSettings.xportExtractAllData;
      xportConfigColumns = extensionSettings.xportColumns?extensionSettings.xportColumns:[];

      if (extensionSettings.sheet) {
        xportType ? loadWorksheetData(extensionSettings.sheet):loadSelectedMarks(extensionSettings.sheet);
      } else {
        document.getElementById('no_data_message').innerHTML = '<h5>The Plugin in not Configured</h5>'
        configure();
      }
      initializeButtons();
    });
  });

  // Pops open the configure page
  function configure() {
    let extpath = `${window.location.href}`;
    const popupUrl = (extpath.search(/index[\.html]*/i) > 0 ? extpath.replace(/index[\.html]*/i,"configurationPopUp.html") : extpath+"configurationPopUp.html");
    console.log(window.location)
    let payload = "";
    tableau.extensions.ui.displayDialogAsync(popupUrl, payload, { height: 600, width: 500 }).then((closePayload) => {
      console.log("Configuration was closed.");
      
      let settings = tableau.extensions.settings.get('xpanditWritebackSettings');
      extensionSettings = settings ? JSON.parse(settings) : {};

      let sheetname = extensionSettings.sheet;
      let xportExtractAllData = extensionSettings.xportExtractAllData;
      if (sheetname) {
        if(document.getElementById('selected_marks_title').innerHTML != sheetname || xportExtractAllData !== xportType){
          xportType = xportExtractAllData;
          if(dataTable){
            dataTable.destroy();
            dataTable = undefined;
            $('#data_table_wrapper').empty();
            $('#no_data_message').css('display', 'inline');
          }
          document.getElementById('selected_marks_title').innerHTML = sheetname;
          document.getElementById('no_data_message').innerHTML = '<h5>No Data</h5>';
          if(xportExtractAllData){
            console.log("Data set to complete load");
            loadWorksheetData(sheetname);
          }else{
            console.log("Data set marks load");
            loadSelectedMarks(sheetname);
          }
        }else{
          // Redo the columns if they are different
          let newConfigColumns = extensionSettings.xportColumns?extensionSettings.xportColumns:[];
          if(JSON.stringify(xportConfigColumns) != JSON.stringify(newConfigColumns)){
            if(dataTable){redoColumns(xportConfigColumns,newConfigColumns)}
            xportConfigColumns = newConfigColumns;
          }
        }
      }

    }).catch((error) => {
        switch (error.errorCode) {
            case tableau.ErrorCodes.DialogClosedByUser:
                console.log("Dialog was closed by user.");
                break;
            default:
                console.log(error.message);
        }
    });
  }

  function redoColumns(oldColumns,newColumns){
    var rowdata = dataTable.rows().data();
    var nColumns = dataTable.settings().init().columns.slice();
    var oCols = dataTable.settings().init().columns;
    //Remove old Config Columns
    for(var i = 0; i< nColumns.length; i++){
      if(oldColumns.indexOf(nColumns[i].title) != -1){
        let max = nColumns.length - i;
        nColumns.splice(i,max);
        break;
      }
    }
    //Add New Config Columns
    for(var i = 0; i < newColumns.length; i++){
      nColumns.push({title:newColumns[i], defaultContent:""});
    }
    // New Column Position
    var positions = {};
    for(var i = 0; i< oCols.length; i++){
      positions[oCols[i].title] = [i,nColumns.map(e => e.title).indexOf(oCols[i].title)];
    }
    // Redo Row Data Order
    var newRows = [];
    for(var y=0;y<rowdata.length; y++){
      var col = new Array(nColumns.length).fill("");
      for(var i = 0; i< oCols.length; i++){
        let colName = oCols[i].title;
        if(positions[colName][1] != -1){
          col[positions[colName][1]] = rowdata[y][positions[colName][0]];
        }
      }
      newRows.push(col);
    }
    populateDataTable(newRows,nColumns,true);
  }
  
  /**
   * Initialize all the buttonss
   */
  function initializeButtons () {
    $('#selected_marks_title').click(showChooseSheetDialog);
    $('#insert_data_button').click(showInsertNewRecord);
    $('#edit_data_button').click(editRecord);
    $('#remove_data_button').click(removeRecord);
    $('#upload_data_button').click(dataWriteBack);
    $('#reload_data_button').click(reloadDataExtract);
    $('#options_sidebar_open').click(sidebarOpen);
    $('#options_sidebar_close').click(sidebarClose);
    hideButtons()
  }

  function sidebarOpen(){
    //Set Options
    $('#extract_all_data').prop("checked", extensionSettings.uploadOnlySelected);
    //Enable Menu
    document.getElementById("options_sidebar").style.display = "block";
  }

  function sidebarClose(){
    //Store Settings
    extensionSettings.uploadOnlySelected = $('#xport_selected_rows').is(":checked");
    //Save Settings
    tableau.extensions.settings.set('xpanditWritebackSettings',JSON.stringify(extensionSettings));
    tableau.extensions.settings.saveAsync().then(function () {
      document.getElementById("options_sidebar").style.display = "none";
    });
    //Disable Menu
  }
  /**
   * Shows the choose sheet UI.
   */
  function showChooseSheetDialog () {
    $('#choose_sheet_buttons').empty();

    const dashboardName = tableau.extensions.dashboardContent.dashboard.name;
    $('#choose_sheet_title').text(dashboardName);

    const worksheets = tableau.extensions.dashboardContent.dashboard.worksheets;

    worksheets.forEach(function (worksheet) {
      const button = Utils.createButton(worksheet.name);

      button.click(function () {
        const worksheetName = worksheet.name;
        extensionSettings.sheet = worksheetName;
        tableau.extensions.settings.set('xpanditWritebackSettings',JSON.stringify(extensionSettings));
        tableau.extensions.settings.saveAsync().then(function () {
          $('#choose_sheet_dialog').modal('toggle');
          if(dataTable){
            dataTable.destroy();
            dataTable = undefined;
          }
          $('#data_table_wrapper').empty();
          $('#no_data_message').css('display', 'inline');
          hideButtons();
          xportType? loadWorksheetData(worksheetName):loadSelectedMarks(worksheetName);
        });
        $('#selected_marks_title').text(worksheetName);
      });
      $('#choose_sheet_buttons').append(button);
    });
    $('#choose_sheet_dialog').modal('toggle');
  }

  /**
   * Send the data to  the endpoint
   */
  function dataWriteBack() {
    var endpointURL = extensionSettings.endpointURL;
    if(endpointURL){
      var inJson = Utils.dataTableToJson(dataTable,extensionSettings.uploadOnlySelected);
      var sendJson = {"data":[]};

      for (var j = 0; j < inJson.data.length; j++){
          var dt = {};
          for(var i = 0; i < inJson.columns.length; i++){
              dt[inJson.columns[i]]=inJson.data[j][inJson.columns[i]];
          }
          sendJson["data"].push(dt);
      }
      var columns = [];

      for(var i = 0; i < inJson.columns.length; i++){
          columns.push(inJson.columns[i]);
      }

      sendJson.columns = columns;
      sendJson.sheet = extensionSettings.xportGoogleSheet;

      $.ajax({
        url:endpointURL,
        type : "POST",
        data : {
          origin : 'tableau',
          input : JSON.stringify(sendJson)
        },
        dataType: 'json',
        success : function (data, status, xhr) {
          console.log("success");
          if(data.error !=undefined){
            $('#overlay-message').text("Post Error. Check console");
            $('#overlay').fadeIn().delay(2000).fadeOut();;
            console.error("AJAX POST ERROR");
            console.error(status);
            console.error(data);
          }else{
            $('#overlay-message').text("Data sent successfully");
            $('#overlay').fadeIn().delay(2000).fadeOut();;
          }
          console.log(data);
        },
        error : function (xhr, status) {
          $('#overlay-message').text("There was an error while sending the data!");
          $('#overlay').fadeIn().delay(2000).fadeOut();
          console.log("Error sending the data");
          console.log(xhr);
          console.log(status);
        }
      });
    }else{
      $('#overlay-message').text("The endpoint URL is not specified. Please configure the extension");
      $('#overlay').fadeIn().delay(2000).fadeOut();
    }
  }

  /**
   * Manually insert a new record or insert a new Column
   */
  function showInsertNewRecord () {

    $('#xport_new_values').empty();
    $('#xp-modal-footer').empty();
    $('#xp-modal-title').text('Insert Record');

    var jColumns = Utils.dataTableColumns(dataTable);

    for(var i = 0;i< jColumns.length ; i++){
        $('#xport_new_values').append(
            `<div class="input xp-margin-10">
            <label for="val${i}">${jColumns[i]}</label>
            <input id="val${i}" type="text" class="form-control"></div>`
        );
    };

    $('#xp-modal-footer').append('<button class="btn xp-btn-success" type="button" id="xport_insert_record_button">Submit</button>');
    $('#xport_insert_record_button').click(function(){
      $('#xport_insert_new_record').modal('toggle');
      var jsonvals ={vals:[]};
      for(var i = 0;i< jColumns.length ; i++){
        jsonvals.vals.push($(`#val${i}`).val());
      };
      if(jsonvals.vals.length > 0){
        dataTable.row.add(jsonvals.vals).draw();
      }
    });

    $('#xport_insert_new_record').modal('toggle');
  }

  function removeRecord () {
    $('#edit_data_button').hide();
    var rr = dataTable.row('.selected').data();
    if(dataTable.row('.selected').data() === undefined){
      dataTable.destroy();
      dataTable = undefined;
      $('#data_table_wrapper').empty();
      $('#no_data_message').css('display', 'inline');
      hideButtons();
    }else{
      dataTable.rows('.selected').remove().draw( false );
    }
  }

  function reloadDataExtract(){
    if(dataTable){
      dataTable.destroy();
      dataTable = undefined;
      $('#data_table_wrapper').empty();
    };
    let worksheetName = extensionSettings.sheet;
    loadWorksheetData(worksheetName);
  }

  /**
   * Edit the Selected record in the Datatable
   */
  function editRecord () {

    $('#xport_new_values').empty();
    $('#xp-modal-footer').empty();
    $('#xp-modal-title').text('Edit Record');

    var jColumns = Utils.dataTableColumns(dataTable);
    var row = dataTable.row('.selected').data();

    var colArray = {columns:jColumns, data: row};

    for(var i = 0;i< colArray.columns.length ; i++){
        if(colArray.data[i] === undefined){
            colArray.data[i] = "";
        }
        $('#xport_new_values').append(
            `<div class="input xp-margin-10">
            <label for="val${i}">${colArray.columns[i]}</label>
            <input id="val${i}" type="text" class="form-control" value='${colArray.data[i]}'></div>`
        );
    };

    $('#xp-modal-footer').append('<button class="btn xp-btn-success" type="button" id="xport_insert_record_button">Submit</button>');
    $('#xport_insert_record_button').click(function(){
      $('#xport_insert_new_record').modal('toggle');
      var vals = [];
      for(var i = 0;i< colArray.columns.length ; i++){
          vals.push($(`#val${i}`).val());
      };
      dataTable.row('.selected').remove()
      dataTable.row.add(vals).draw();
      $('#edit_data_button').hide();
    });

    $('#xport_insert_new_record').modal('toggle');
  }

  function getSelectedSheet (worksheetName) {
    if (!worksheetName) {
      worksheetName = extensionSettings.sheet;
    }

    return tableau.extensions.dashboardContent.dashboard.worksheets.find(function (sheet) {
      return sheet.name === worksheetName;
    });
  }

  /**
   * Load all the data in the worksheet
   * @param {*} worksheetName
   */
  function loadWorksheetData (worksheetName){
    $('#reload_data_button').show();

    const worksheet = getSelectedSheet(worksheetName);

    $('#selected_marks_title').text(worksheet.name);

    worksheet.getSummaryDataAsync({ignoreSelection:true}).then(dtt => {

      const data = dtt.data.map((row, index) => {
        const rowData = row.map(cell => {
          return cell.formattedValue;
        });
        return rowData;
      });

      const columns = dtt.columns.map(column => {
        return { title: column.fieldName };
      });

      var measures = Utils.findMeasures(columns);
      var cols = Utils.removeMeasuresColumns(measures,columns);
      var newCols = Utils.renameATTR(cols);
      var dt = Utils.removeMeasuresData(measures,data);

      populateDataTable(dt, newCols);
    });
  }

  /**
   * Load the Selected mark in the Sheet into the Datatable
   * @param {*} worksheetName
   */
  function loadSelectedMarks (worksheetName) {
    $('#reload_data_button').hide();

    if (unregisterEventHandlerFunction) {
      unregisterEventHandlerFunction();
    }

    const worksheet = getSelectedSheet(worksheetName);

    $('#selected_marks_title').text(worksheet.name);

    worksheet.getSelectedMarksAsync().then(function (marks) {
      const worksheetData = marks.data[0];

      const data = worksheetData.data.map(function (row, index) {
        const rowData = row.map(function (cell) {
          return cell.formattedValue;
        });

        return rowData;
      });

      const columns = worksheetData.columns.map(function (column) {
        return { title: column.fieldName };
      });

      // Identify measures
      var measures = Utils.findMeasures(columns);
      // Remove measures Columns
      var cols = Utils.removeMeasuresColumns(measures,columns);
      // Rename fields with ATTR
      var newCols = Utils.renameATTR(cols);
      // Remove Measure Data
      var dt = Utils.removeMeasuresData(measures,data);
      // Set New Columns
      datacolumns = newCols;
      // Well, the next lines of code seem like bullshit (#johny)
      if(dataTable){
        dataTable.row.add(dt[0]).draw();
      }else{
        populateDataTable(dt, newCols);
      }
    });

    /**
     * Event Listener for selected record in the worksheet
     */
    unregisterEventHandlerFunction = worksheet.addEventListener(tableau.TableauEventType.MarkSelectionChanged, function (selectionEvent) {
      loadSelectedMarks(worksheetName);
    });
  }
  
  /**
   * Create de Datatable and show all the buttons
   * */
  function populateDataTable (data, columns, redoFlag) {
    if(redoFlag === undefined){redoFlag = false}
    $('#data_table_wrapper').empty();

    if (data.length > 0) {
      if(dataTable){dataTable.destroy();}
      $('#no_data_message').css('display', 'none');
      $('#data_table_wrapper').append(`<table id='data_table' class='table table-responsive table-striped'></table>`);

      var top = $('#data_table_wrapper')[0].getBoundingClientRect().top;
      var height = $(document).height() - top - 100;

      let xportColumns = extensionSettings.xportColumns;
      var new_columns = [];
      if(!redoFlag){
        if(xportColumns){
          new_columns = xportColumns;
          for(var i = 0; i < new_columns.length; i++){
            columns.push({title:new_columns[i], defaultContent:""});
          }
        }
      }

      dataTable = $('#data_table').DataTable({
        data: data,
        columns: columns,
        autoWidth: false,
        deferRender: true,
        scroller: true,
        scrollY: height,
        scrollX: true,
        searching: false,
        select: true,
        dom: "<'row'<'col-sm-12'tr>>"
      });

      dataTable.on('select', function ( e, dt, type, indexes ) {
        if ( type === 'row' ) {
          $('#edit_data_button').show();
        }
      });

      dataTable.on('deselect', function ( e, dt, type, indexes ) {
        if ( type === 'row' ) {
          console.log(dataTable.row('.selected').data());
          if(dataTable.row('.selected').data() === undefined){
            $('#edit_data_button').hide();
          }
        }
      });

      showButtons()
    } else {
      $('#no_data_message').css('display', 'inline');
      hideButtons()
    }
  }

  function hideButtons(){
    $('#edit_data_button').hide();
    $('#upload_data_button').hide();
    $('#insert_data_button').hide();
    $('#remove_data_button').hide();
    if(!xportType){$('#reload_data_button').hide()};
  }
  function showButtons(){
    $('#upload_data_button').show();
    $('#insert_data_button').show();
    $('#remove_data_button').show();
  }

})();
