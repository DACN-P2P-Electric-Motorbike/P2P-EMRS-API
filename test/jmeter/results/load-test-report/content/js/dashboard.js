/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

/*
 * Add header in statistics table to group metrics by category
 * format
 *
 */
function summaryTableHeader(header) {
    var newRow = header.insertRow(-1);
    newRow.className = "tablesorter-no-sort";
    var cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Requests";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 3;
    cell.innerHTML = "Executions";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 7;
    cell.innerHTML = "Response Times (ms)";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Throughput";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 2;
    cell.innerHTML = "Network (KB/sec)";
    newRow.appendChild(cell);
}

/*
 * Populates the table identified by id parameter with the specified data and
 * format
 *
 */
function createTable(table, info, formatter, defaultSorts, seriesIndex, headerCreator) {
    var tableRef = table[0];

    // Create header and populate it with data.titles array
    var header = tableRef.createTHead();

    // Call callback is available
    if(headerCreator) {
        headerCreator(header);
    }

    var newRow = header.insertRow(-1);
    for (var index = 0; index < info.titles.length; index++) {
        var cell = document.createElement('th');
        cell.innerHTML = info.titles[index];
        newRow.appendChild(cell);
    }

    var tBody;

    // Create overall body if defined
    if(info.overall){
        tBody = document.createElement('tbody');
        tBody.className = "tablesorter-no-sort";
        tableRef.appendChild(tBody);
        var newRow = tBody.insertRow(-1);
        var data = info.overall.data;
        for(var index=0;index < data.length; index++){
            var cell = newRow.insertCell(-1);
            cell.innerHTML = formatter ? formatter(index, data[index]): data[index];
        }
    }

    // Create regular body
    tBody = document.createElement('tbody');
    tableRef.appendChild(tBody);

    var regexp;
    if(seriesFilter) {
        regexp = new RegExp(seriesFilter, 'i');
    }
    // Populate body with data.items array
    for(var index=0; index < info.items.length; index++){
        var item = info.items[index];
        if((!regexp || filtersOnlySampleSeries && !info.supportsControllersDiscrimination || regexp.test(item.data[seriesIndex]))
                &&
                (!showControllersOnly || !info.supportsControllersDiscrimination || item.isController)){
            if(item.data.length > 0) {
                var newRow = tBody.insertRow(-1);
                for(var col=0; col < item.data.length; col++){
                    var cell = newRow.insertCell(-1);
                    cell.innerHTML = formatter ? formatter(col, item.data[col]) : item.data[col];
                }
            }
        }
    }

    // Add support of columns sort
    table.tablesorter({sortList : defaultSorts});
}

$(document).ready(function() {

    // Customize table sorter default options
    $.extend( $.tablesorter.defaults, {
        theme: 'blue',
        cssInfoBlock: "tablesorter-no-sort",
        widthFixed: true,
        widgets: ['zebra']
    });

    var data = {"OkPercent": 98.30845771144278, "KoPercent": 1.691542288557214};
    var dataset = [
        {
            "label" : "FAIL",
            "data" : data.KoPercent,
            "color" : "#FF6347"
        },
        {
            "label" : "PASS",
            "data" : data.OkPercent,
            "color" : "#9ACD32"
        }];
    $.plot($("#flot-requests-summary"), dataset, {
        series : {
            pie : {
                show : true,
                radius : 1,
                label : {
                    show : true,
                    radius : 3 / 4,
                    formatter : function(label, series) {
                        return '<div style="font-size:8pt;text-align:center;padding:2px;color:white;">'
                            + label
                            + '<br/>'
                            + Math.round10(series.percent, -2)
                            + '%</div>';
                    },
                    background : {
                        opacity : 0.5,
                        color : '#000'
                    }
                }
            }
        },
        legend : {
            show : true
        }
    });

    // Creates APDEX table
    createTable($("#apdexTable"), {"supportsControllersDiscrimination": true, "overall": {"data": [0.9084577114427861, 500, 1500, "Total"], "isController": false}, "titles": ["Apdex", "T (Toleration threshold)", "F (Frustration threshold)", "Label"], "items": [{"data": [1.0, 500, 1500, "TG4 - GET /admin/vehicles"], "isController": false}, {"data": [1.0, 500, 1500, "TG4 - GET /admin/users"], "isController": false}, {"data": [0.56, 500, 1500, "TG1 - POST /bookings"], "isController": false}, {"data": [0.94, 500, 1500, "TG1 - GET /bookings/:bookingId"], "isController": false}, {"data": [0.98, 500, 1500, "TG3 - GET /payments/:paymentId"], "isController": false}, {"data": [1.0, 500, 1500, "TG3 - GET /payments/by-booking"], "isController": false}, {"data": [1.0, 500, 1500, "TG3 - PATCH /notifications/read-all"], "isController": false}, {"data": [0.94, 500, 1500, "TG2 - GET /owner/bookings?status=PENDING"], "isController": false}, {"data": [1.0, 500, 1500, "TG3 - GET /notifications"], "isController": false}, {"data": [0.72, 500, 1500, "TG3 - GET /reviews/trust-score/:renterId"], "isController": false}, {"data": [0.96, 500, 1500, "TG1 - GET /bookings (my-bookings)"], "isController": false}, {"data": [0.94, 500, 1500, "TG1 - POST /auth/login (Renter)"], "isController": false}, {"data": [1.0, 500, 1500, "TG3 - GET /reviews/vehicle/:vehicleID"], "isController": false}, {"data": [0.5, 500, 1500, "TG4 - GET /admin/dashboard"], "isController": false}, {"data": [1.0, 500, 1500, "TG2 - POST /auth/login (Owner)"], "isController": false}, {"data": [0.89, 500, 1500, "TG2 - GET /owner/bookings"], "isController": false}, {"data": [0.95, 500, 1500, "TG3 - POST /payments"], "isController": false}, {"data": [0.97, 500, 1500, "TG1 - GET /vehicles/:vehicleID"], "isController": false}, {"data": [1.0, 500, 1500, "TG3 - POST /auth/login (Renter)"], "isController": false}, {"data": [1.0, 500, 1500, "TG3 - GET /bookings?status=CONFIRMED"], "isController": false}, {"data": [1.0, 500, 1500, "TG4 - POST /auth/login (Admin)"], "isController": false}, {"data": [0.36, 500, 1500, "TG2 - PATCH /owner/bookings/:id/approve"], "isController": false}, {"data": [1.0, 500, 1500, "TG4 - GET /admin/reports/top-vehicles"], "isController": false}, {"data": [0.96, 500, 1500, "TG1 - GET /vehicles/available"], "isController": false}, {"data": [1.0, 500, 1500, "TG2 - GET /vehicles/my-vehicles"], "isController": false}]}, function(index, item){
        switch(index){
            case 0:
                item = item.toFixed(3);
                break;
            case 1:
            case 2:
                item = formatDuration(item);
                break;
        }
        return item;
    }, [[0, 0]], 3);

    // Create statistics table
    createTable($("#statisticsTable"), {"supportsControllersDiscrimination": true, "overall": {"data": ["Total", 1005, 17, 1.691542288557214, 313.1552238805965, 68, 1906, 257.0, 564.8, 688.0999999999998, 1089.8199999999997, 10.48086850420799, 649.4029005054022, 0.0], "isController": false}, "titles": ["Label", "#Samples", "FAIL", "Error %", "Average", "Min", "Max", "Median", "90th pct", "95th pct", "99th pct", "Transactions/s", "Received", "Sent"], "items": [{"data": ["TG4 - GET /admin/vehicles", 1, 0, 0.0, 276.0, 276, 276, 276.0, 276.0, 276.0, 276.0, 3.6231884057971016, 14.446756114130434, 0.0], "isController": false}, {"data": ["TG4 - GET /admin/users", 1, 0, 0.0, 175.0, 175, 175, 175.0, 175.0, 175.0, 175.0, 5.714285714285714, 18.989955357142858, 0.0], "isController": false}, {"data": ["TG1 - POST /bookings", 50, 0, 0.0, 729.7800000000001, 413, 1906, 637.0, 1251.7999999999997, 1510.8999999999985, 1906.0, 1.705378764623623, 2.7900929218254373, 0.0], "isController": false}, {"data": ["TG1 - GET /bookings/:bookingId", 50, 0, 0.0, 286.40000000000003, 141, 1087, 207.5, 714.8, 812.5999999999993, 1087.0, 1.7340639522785601, 3.2552986491641813, 0.0], "isController": false}, {"data": ["TG3 - GET /payments/:paymentId", 50, 0, 0.0, 307.3400000000001, 168, 585, 310.5, 456.79999999999995, 521.4999999999997, 585.0, 1.6611295681063123, 3.2608752076411958, 0.0], "isController": false}, {"data": ["TG3 - GET /payments/by-booking", 50, 0, 0.0, 226.1, 119, 462, 204.5, 354.9, 403.94999999999976, 462.0, 1.6585398215411151, 1.162986263143928, 0.0], "isController": false}, {"data": ["TG3 - PATCH /notifications/read-all", 50, 0, 0.0, 304.76, 148, 498, 303.0, 449.4, 468.04999999999995, 498.0, 1.6485328058028355, 0.49101807204088366, 0.0], "isController": false}, {"data": ["TG2 - GET /owner/bookings?status=PENDING", 50, 0, 0.0, 371.76, 187, 1160, 328.0, 555.1999999999999, 737.3999999999996, 1160.0, 1.6588699777711424, 808.0938858199795, 0.0], "isController": false}, {"data": ["TG3 - GET /notifications", 50, 0, 0.0, 217.07999999999998, 115, 415, 199.0, 325.8, 382.4999999999999, 415.0, 1.6557936218829685, 3.1883082342616818, 0.0], "isController": false}, {"data": ["TG3 - GET /reviews/trust-score/:renterId", 50, 0, 0.0, 512.9799999999999, 318, 949, 520.0, 701.7, 757.6999999999997, 949.0, 1.6377333770062235, 0.8956354405502783, 0.0], "isController": false}, {"data": ["TG1 - GET /bookings (my-bookings)", 50, 0, 0.0, 242.5, 140, 799, 209.0, 290.3, 671.3499999999993, 799.0, 1.7550633577872161, 22.98121780555653, 0.0], "isController": false}, {"data": ["TG1 - POST /auth/login (Renter)", 50, 0, 0.0, 316.8599999999999, 99, 1488, 235.5, 708.0, 1024.5499999999988, 1488.0, 1.6850903208411971, 1.4991379709827446, 0.0], "isController": false}, {"data": ["TG3 - GET /reviews/vehicle/:vehicleID", 50, 0, 0.0, 158.46, 75, 437, 139.5, 266.09999999999997, 302.84999999999985, 437.0, 1.6640042598509053, 0.4696262022430778, 0.0], "isController": false}, {"data": ["TG4 - GET /admin/dashboard", 1, 0, 0.0, 737.0, 737, 737, 737.0, 737.0, 737.0, 737.0, 1.3568521031207597, 4.069231258480325, 0.0], "isController": false}, {"data": ["TG2 - POST /auth/login (Owner)", 50, 0, 0.0, 260.4200000000001, 101, 475, 264.0, 357.0, 427.4999999999997, 475.0, 1.6901598891255112, 1.5251052124530982, 0.0], "isController": false}, {"data": ["TG2 - GET /owner/bookings", 50, 0, 0.0, 464.1800000000001, 280, 1049, 417.5, 682.4999999999999, 896.35, 1049.0, 1.6948003525184734, 1131.0344160989087, 0.0], "isController": false}, {"data": ["TG3 - POST /payments", 50, 0, 0.0, 364.58, 154, 550, 369.0, 508.29999999999995, 529.8, 550.0, 1.6631740012640122, 1.1743567674550113, 0.0], "isController": false}, {"data": ["TG1 - GET /vehicles/:vehicleID", 50, 0, 0.0, 191.78000000000003, 78, 1090, 139.0, 454.4, 546.5499999999996, 1090.0, 1.7448352875488553, 2.0128992401242325, 0.0], "isController": false}, {"data": ["TG3 - POST /auth/login (Renter)", 50, 0, 0.0, 263.74000000000007, 100, 463, 269.0, 374.6, 422.19999999999976, 463.0, 1.6796560064498791, 1.4943033416756248, 0.0], "isController": false}, {"data": ["TG3 - GET /bookings?status=CONFIRMED", 50, 0, 0.0, 232.96000000000006, 115, 423, 216.5, 356.0, 407.4, 423.0, 1.678810059429876, 6.63038163549676, 0.0], "isController": false}, {"data": ["TG4 - POST /auth/login (Admin)", 1, 0, 0.0, 223.0, 223, 223, 223.0, 223.0, 223.0, 223.0, 4.484304932735426, 4.0025924887892375, 0.0], "isController": false}, {"data": ["TG2 - PATCH /owner/bookings/:id/approve", 50, 17, 34.0, 440.04, 128, 770, 543.0, 630.0, 695.0999999999997, 770.0, 1.6733601070950468, 2.0439832245649265, 0.0], "isController": false}, {"data": ["TG4 - GET /admin/reports/top-vehicles", 1, 0, 0.0, 194.0, 194, 194, 194.0, 194.0, 194.0, 194.0, 5.154639175257732, 1.6057909149484535, 0.0], "isController": false}, {"data": ["TG1 - GET /vehicles/available", 50, 0, 0.0, 206.26000000000005, 68, 824, 146.0, 442.19999999999993, 586.0999999999996, 824.0, 1.7464198393293748, 30.229777004016768, 0.0], "isController": false}, {"data": ["TG2 - GET /vehicles/my-vehicles", 50, 0, 0.0, 164.33999999999997, 88, 390, 145.0, 245.7, 289.8499999999997, 390.0, 1.692219176227705, 69.96433912495347, 0.0], "isController": false}]}, function(index, item){
        switch(index){
            // Errors pct
            case 3:
                item = item.toFixed(2) + '%';
                break;
            // Mean
            case 4:
            // Mean
            case 7:
            // Median
            case 8:
            // Percentile 1
            case 9:
            // Percentile 2
            case 10:
            // Percentile 3
            case 11:
            // Throughput
            case 12:
            // Kbytes/s
            case 13:
            // Sent Kbytes/s
                item = item.toFixed(2);
                break;
        }
        return item;
    }, [[0, 0]], 0, summaryTableHeader);

    // Create error table
    createTable($("#errorsTable"), {"supportsControllersDiscrimination": false, "titles": ["Type of error", "Number of errors", "% in errors", "% in all samples"], "items": [{"data": ["400/Bad Request", 17, 100.0, 1.691542288557214], "isController": false}]}, function(index, item){
        switch(index){
            case 2:
            case 3:
                item = item.toFixed(2) + '%';
                break;
        }
        return item;
    }, [[1, 1]]);

        // Create top5 errors by sampler
    createTable($("#top5ErrorsBySamplerTable"), {"supportsControllersDiscrimination": false, "overall": {"data": ["Total", 1005, 17, "400/Bad Request", 17, "", "", "", "", "", "", "", ""], "isController": false}, "titles": ["Sample", "#Samples", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors"], "items": [{"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["TG2 - PATCH /owner/bookings/:id/approve", 50, 17, "400/Bad Request", 17, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}]}, function(index, item){
        return item;
    }, [[0, 0]], 0);

});
