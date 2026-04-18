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

    var data = {"OkPercent": 95.15938024277115, "KoPercent": 4.840619757228856};
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
    createTable($("#apdexTable"), {"supportsControllersDiscrimination": true, "overall": {"data": [0.2759548011447745, 500, 1500, "Total"], "isController": false}, "titles": ["Apdex", "T (Toleration threshold)", "F (Frustration threshold)", "Label"], "items": [{"data": [0.3037593984962406, 500, 1500, "S3-TG1 - POST /auth/login (Renter)"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG2 - GET /owner/bookings"], "isController": false}, {"data": [0.06680161943319839, 500, 1500, "S4-TG2 - POST /auth/login (Owner)"], "isController": false}, {"data": [0.6875, 500, 1500, "S1-TG2 - POST /auth/login (Owner)"], "isController": false}, {"data": [0.05593220338983051, 500, 1500, "S3-TG1 - GET /bookings"], "isController": false}, {"data": [0.08333333333333333, 500, 1500, "S4-TG1 - GET /reviews/vehicle/:vehicleID"], "isController": false}, {"data": [0.3913612565445026, 500, 1500, "S1-TG3 - POST /payments"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG2 - PATCH /owner/bookings/:id/approve"], "isController": false}, {"data": [0.11083743842364532, 500, 1500, "S1-TG2 - GET /owner/bookings"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG2 - GET /vehicles/my-vehicles"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG1 - POST /bookings"], "isController": false}, {"data": [0.9782608695652174, 500, 1500, "S2-TG4 - GET /admin/bookings"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG1 - GET /vehicles/available"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG2 - GET /owner/bookings?status=PENDING"], "isController": false}, {"data": [0.9782608695652174, 500, 1500, "S2-TG4 - GET /admin/users"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG1 - GET /bookings"], "isController": false}, {"data": [0.5976863753213367, 500, 1500, "S1-TG3 - GET /bookings?status=CONFIRMED"], "isController": false}, {"data": [0.0735645933014354, 500, 1500, "S2-TG3 - POST /payments"], "isController": false}, {"data": [0.05111524163568773, 500, 1500, "S3-TG1 - GET /notifications"], "isController": false}, {"data": [0.013333333333333334, 500, 1500, "S3-TG2 - GET /owner/bookings?status=PENDING"], "isController": false}, {"data": [0.16025641025641027, 500, 1500, "S3-TG2 - POST /auth/login (Owner)"], "isController": false}, {"data": [0.21351351351351353, 500, 1500, "S1-TG3 - GET /reviews/trust-score/:renterId"], "isController": false}, {"data": [0.0, 500, 1500, "S4-TG2 - GET /owner/bookings?status=PENDING"], "isController": false}, {"data": [0.9805194805194806, 500, 1500, "S1-TG4 - GET /admin/bookings"], "isController": false}, {"data": [0.0026455026455026454, 500, 1500, "S3-TG2 - PATCH /owner/bookings/:id/approve"], "isController": false}, {"data": [0.14427570093457945, 500, 1500, "S2-TG3 - GET /bookings?status=CONFIRMED"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG1 - POST /auth/login (Renter)"], "isController": false}, {"data": [0.0, 500, 1500, "S3-TG2 - GET /owner/bookings"], "isController": false}, {"data": [0.0, 500, 1500, "S2-TG2 - POST /auth/login (Owner)"], "isController": false}, {"data": [0.37034739454094295, 500, 1500, "S2-TG3 - GET /reviews/vehicle/:vehicleID"], "isController": false}, {"data": [0.5366847826086957, 500, 1500, "S1-TG1 - GET /bookings/:bookingId"], "isController": false}, {"data": [0.02109375, 500, 1500, "S3-TG1 - POST /bookings"], "isController": false}, {"data": [0.17248908296943233, 500, 1500, "S1-TG2 - GET /owner/bookings?status=PENDING"], "isController": false}, {"data": [0.5294117647058824, 500, 1500, "S1-TG1 - GET /bookings"], "isController": false}, {"data": [0.49563318777292575, 500, 1500, "S1-TG2 - GET /vehicles/my-vehicles"], "isController": false}, {"data": [0.987012987012987, 500, 1500, "S1-TG4 - GET /admin/users"], "isController": false}, {"data": [0.12781954887218044, 500, 1500, "S3-TG1 - GET /vehicles/available"], "isController": false}, {"data": [0.0, 500, 1500, "S4-TG2 - PATCH /owner/bookings/:id/approve"], "isController": false}, {"data": [0.015375153751537515, 500, 1500, "S4-TG1 - POST /bookings"], "isController": false}, {"data": [0.053824362606232294, 500, 1500, "S4-TG1 - GET /notifications"], "isController": false}, {"data": [0.5767898383371824, 500, 1500, "S2-TG3 - POST /auth/login (Renter)"], "isController": false}, {"data": [0.8287153652392947, 500, 1500, "S1-TG1 - POST /auth/login (Renter)"], "isController": false}, {"data": [0.6340057636887608, 500, 1500, "S1-TG3 - PATCH /notifications/read-all"], "isController": false}, {"data": [0.0987012987012987, 500, 1500, "S1-TG1 - POST /bookings"], "isController": false}, {"data": [0.24037339556592766, 500, 1500, "S4-TG1 - POST /auth/login (Renter)"], "isController": false}, {"data": [0.037037037037037035, 500, 1500, "S1-TG2 - PATCH /owner/bookings/:id/approve"], "isController": false}, {"data": [0.9608695652173913, 500, 1500, "S2-TG4 - POST /auth/login (Admin)"], "isController": false}, {"data": [0.1227735368956743, 500, 1500, "S2-TG3 - GET /notifications"], "isController": false}, {"data": [0.11323003575685339, 500, 1500, "S4-TG1 - GET /vehicles/available"], "isController": false}, {"data": [0.9333333333333333, 500, 1500, "S1-TG3 - POST /auth/login (Renter)"], "isController": false}, {"data": [0.7211796246648794, 500, 1500, "S1-TG3 - GET /reviews/vehicle/:vehicleID"], "isController": false}, {"data": [0.07268722466960352, 500, 1500, "S3-TG2 - GET /vehicles/my-vehicles"], "isController": false}, {"data": [0.6079691516709511, 500, 1500, "S1-TG1 - GET /vehicles/:vehicleID"], "isController": false}, {"data": [0.6151898734177215, 500, 1500, "S1-TG1 - GET /vehicles/available"], "isController": false}, {"data": [0.9871794871794872, 500, 1500, "S1-TG4 - POST /auth/login (Admin)"], "isController": false}, {"data": [0.5943661971830986, 500, 1500, "S1-TG3 - GET /notifications"], "isController": false}]}, function(index, item){
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
    createTable($("#statisticsTable"), {"supportsControllersDiscrimination": true, "overall": {"data": ["Total", 20266, 981, 4.840619757228856, 5106.729695055768, 0, 296124, 1800.0, 8238.900000000001, 15640.600000000006, 70277.98000000033, 6.2944690916906545, 491.15362953045855, 0.0], "isController": false}, "titles": ["Label", "#Samples", "FAIL", "Error %", "Average", "Min", "Max", "Median", "90th pct", "95th pct", "99th pct", "Transactions/s", "Received", "Sent"], "items": [{"data": ["S3-TG1 - POST /auth/login (Renter)", 665, 0, 0.0, 1349.1909774436094, 118, 2391, 1500.0, 1875.6, 1943.0, 2341.6800000000003, 7.420301498566152, 6.601459633978286, 0.0], "isController": false}, {"data": ["S2-TG2 - GET /owner/bookings", 40, 40, 100.0, 2.25, 0, 6, 2.0, 3.0, 4.949999999999996, 6.0, 0.608198515995621, 0.22391683645541904, 0.0], "isController": false}, {"data": ["S4-TG2 - POST /auth/login (Owner)", 247, 0, 0.0, 10162.777327935222, 178, 33014, 10883.0, 17576.4, 23540.79999999999, 32943.76, 2.396731905644449, 2.162676055483858, 0.0], "isController": false}, {"data": ["S1-TG2 - POST /auth/login (Owner)", 232, 0, 0.0, 690.4612068965517, 101, 2142, 634.5, 1257.1000000000001, 1473.6999999999998, 1734.9799999999989, 3.7941354440937416, 3.423614404631462, 0.0], "isController": false}, {"data": ["S3-TG1 - GET /bookings", 590, 0, 0.0, 4071.97966101695, 171, 5571, 4672.5, 5126.8, 5283.9, 5437.620000000001, 6.349753005370385, 154.24515503419718, 0.0], "isController": false}, {"data": ["S4-TG1 - GET /reviews/vehicle/:vehicleID", 738, 0, 0.0, 3069.3401084010866, 107, 4348, 3546.0, 3960.0, 4045.6999999999994, 4238.61, 8.047280498975008, 2.2711563126990013, 0.0], "isController": false}, {"data": ["S1-TG3 - POST /payments", 382, 0, 0.0, 1268.7198952879592, 186, 3792, 1370.0, 1698.1, 2252.9499999999985, 3566.5200000000023, 6.303734385055859, 4.451039053862275, 0.0], "isController": false}, {"data": ["S2-TG2 - PATCH /owner/bookings/:id/approve", 40, 40, 100.0, 3.0000000000000013, 1, 6, 3.0, 5.0, 5.0, 6.0, 0.6081337894336754, 0.2238930064614215, 0.0], "isController": false}, {"data": ["S1-TG2 - GET /owner/bookings", 203, 0, 0.0, 3048.940886699508, 412, 5703, 3410.0, 4759.4, 4981.799999999999, 5290.8, 3.3703574571234083, 2710.9765099678734, 0.0], "isController": false}, {"data": ["S2-TG2 - GET /vehicles/my-vehicles", 40, 40, 100.0, 5.775, 1, 18, 5.5, 10.0, 11.949999999999996, 18.0, 0.6079951360389116, 0.22384195926432587, 0.0], "isController": false}, {"data": ["S2-TG1 - POST /bookings", 96, 96, 100.0, 10.614583333333334, 1, 97, 5.0, 19.299999999999997, 46.19999999999976, 97.0, 4.069866033576394, 1.4983784127522468, 0.0], "isController": false}, {"data": ["S2-TG4 - GET /admin/bookings", 115, 0, 0.0, 266.4347826086958, 124, 776, 231.0, 441.4000000000001, 488.5999999999995, 765.2800000000002, 1.2999197440853651, 13.072825707608487, 0.0], "isController": false}, {"data": ["S2-TG1 - GET /vehicles/available", 134, 134, 100.0, 68998.38059701494, 3, 296124, 19.0, 264450.5, 275029.75, 296123.65, 0.3496366648836936, 0.12291913999817354, 0.0], "isController": false}, {"data": ["S2-TG2 - GET /owner/bookings?status=PENDING", 40, 40, 100.0, 2.3250000000000006, 1, 6, 2.0, 3.8999999999999986, 5.8999999999999915, 6.0, 0.6080968090119947, 0.2238793915991426, 0.0], "isController": false}, {"data": ["S2-TG4 - GET /admin/users", 115, 0, 0.0, 210.31304347826085, 82, 1175, 162.0, 351.6000000000001, 449.79999999999876, 1158.0400000000004, 1.2953805602802528, 4.304863326790723, 0.0], "isController": false}, {"data": ["S2-TG1 - GET /bookings", 96, 96, 100.0, 8.885416666666664, 0, 82, 2.5, 22.299999999999997, 34.89999999999995, 82.0, 4.070038580574045, 1.498441938355874, 0.0], "isController": false}, {"data": ["S1-TG3 - GET /bookings?status=CONFIRMED", 389, 0, 0.0, 763.7609254498717, 105, 2560, 803.0, 1073.0, 1553.0, 2375.9000000000015, 6.418930068314577, 28.040083763737172, 0.0], "isController": false}, {"data": ["S2-TG3 - POST /payments", 836, 0, 0.0, 3202.912679425836, 322, 5459, 3599.0, 4066.6000000000004, 4276.15, 5390.26, 9.344018598620751, 6.597759244822229, 0.0], "isController": false}, {"data": ["S3-TG1 - GET /notifications", 538, 0, 0.0, 4103.710037174721, 168, 5589, 4626.5, 5082.3, 5256.1, 5519.83, 5.9254364227105025, 20.34441212002313, 0.0], "isController": false}, {"data": ["S3-TG2 - GET /owner/bookings?status=PENDING", 225, 0, 0.0, 17113.10222222222, 1025, 41048, 16950.0, 31649.800000000003, 40129.6, 40690.4, 1.8863653512412284, 2629.445984648654, 0.0], "isController": false}, {"data": ["S3-TG2 - POST /auth/login (Owner)", 234, 0, 0.0, 3431.581196581197, 96, 16519, 3135.0, 6555.0, 8287.25, 16135.45, 2.20314088803525, 1.9879904106880577, 0.0], "isController": false}, {"data": ["S1-TG3 - GET /reviews/trust-score/:renterId", 370, 0, 0.0, 1753.2891891891893, 243, 5224, 1959.5, 2351.7000000000003, 3426.8, 4508.960000000001, 6.153129781148141, 3.3706282376687953, 0.0], "isController": false}, {"data": ["S4-TG2 - GET /owner/bookings?status=PENDING", 236, 0, 0.0, 40810.652542372874, 3353, 64794, 46852.5, 58503.7, 59084.09999999999, 63279.45, 2.0142362118703376, 4968.245374084632, 0.0], "isController": false}, {"data": ["S1-TG4 - GET /admin/bookings", 77, 0, 0.0, 240.1428571428571, 118, 713, 204.0, 389.8000000000001, 455.5999999999991, 713.0, 1.3009174001926034, 13.082858776546317, 0.0], "isController": false}, {"data": ["S3-TG2 - PATCH /owner/bookings/:id/approve", 189, 97, 51.32275132275132, 17657.62962962964, 1312, 40036, 14828.0, 32563.0, 33237.0, 39331.299999999996, 1.5810078297530616, 1.5797743011987218, 0.0], "isController": false}, {"data": ["S2-TG3 - GET /bookings?status=CONFIRMED", 856, 0, 0.0, 1903.450934579438, 146, 4034, 2104.0, 2491.3, 2565.45, 3991.8599999999997, 9.57098292652929, 42.03600544237843, 0.0], "isController": false}, {"data": ["S2-TG1 - POST /auth/login (Renter)", 196, 196, 100.0, 58750.26530612245, 4, 228716, 21188.5, 190405.5, 210345.05, 228432.76, 0.7645200296446543, 0.26877657292194873, 0.0], "isController": false}, {"data": ["S3-TG2 - GET /owner/bookings", 181, 0, 0.0, 26985.077348066297, 2800, 41920, 24943.0, 40580.0, 40961.4, 41443.58, 1.5532747494164494, 2618.9758811991537, 0.0], "isController": false}, {"data": ["S2-TG2 - POST /auth/login (Owner)", 140, 51, 36.42857142857143, 59811.27142857143, 12818, 85279, 71917.5, 81882.8, 83287.95, 85149.85, 1.3918022845440357, 0.976630459095925, 0.0], "isController": false}, {"data": ["S2-TG3 - GET /reviews/vehicle/:vehicleID", 806, 0, 0.0, 1304.414392059556, 84, 3271, 1417.5, 1655.0, 1727.0, 3238.58, 9.095628230302209, 2.567027889216151, 0.0], "isController": false}, {"data": ["S1-TG1 - GET /bookings/:bookingId", 368, 0, 0.0, 1071.2826086956518, 149, 1653, 1179.5, 1450.1, 1484.55, 1590.6100000000001, 6.310662962581884, 11.846694190074425, 0.0], "isController": false}, {"data": ["S3-TG1 - POST /bookings", 640, 10, 1.5625, 6698.218749999994, 198, 9127, 7862.0, 8649.8, 8778.95, 8958.08, 6.7727734507280735, 10.948752129719777, 0.0], "isController": false}, {"data": ["S1-TG2 - GET /owner/bookings?status=PENDING", 229, 0, 0.0, 2581.026200873362, 366, 4959, 2759.0, 4479.0, 4689.0, 4888.5, 3.7275775629130448, 1955.3797857507652, 0.0], "isController": false}, {"data": ["S1-TG1 - GET /bookings", 357, 0, 0.0, 1074.1652661064425, 136, 1662, 1182.0, 1451.6, 1512.8999999999996, 1617.3600000000001, 6.192970891302085, 66.97847232461923, 0.0], "isController": false}, {"data": ["S1-TG2 - GET /vehicles/my-vehicles", 229, 0, 0.0, 1069.6113537117906, 86, 3265, 963.0, 2070.0, 2368.0, 3193.4, 3.951341558105427, 163.3671362749116, 0.0], "isController": false}, {"data": ["S1-TG4 - GET /admin/users", 77, 0, 0.0, 193.70129870129875, 79, 612, 174.0, 310.8000000000001, 468.4999999999999, 612.0, 1.2998413180728585, 4.31968750527533, 0.0], "isController": false}, {"data": ["S3-TG1 - GET /vehicles/available", 665, 0, 0.0, 2576.3578947368405, 92, 4053, 3076.0, 3485.4, 3631.5999999999995, 3759.4600000000005, 7.192766132346897, 124.5036911092273, 0.0], "isController": false}, {"data": ["S4-TG2 - PATCH /owner/bookings/:id/approve", 121, 38, 31.40495867768595, 52547.22314049586, 15606, 80468, 55472.0, 70574.8, 72655.4, 79814.6, 0.9365542543557513, 1.1748954600339017, 0.0], "isController": false}, {"data": ["S4-TG1 - POST /bookings", 813, 43, 5.289052890528906, 7574.114391143912, 248, 10326, 9196.0, 9842.2, 9961.0, 10115.44, 8.60299252925864, 13.50792964368479, 0.0], "isController": false}, {"data": ["S4-TG1 - GET /notifications", 706, 0, 0.0, 4678.005665722373, 166, 6257, 5372.0, 5887.0, 5986.0, 6195.37, 7.634743489921273, 31.668919037654643, 0.0], "isController": false}, {"data": ["S2-TG3 - POST /auth/login (Renter)", 866, 0, 0.0, 769.4480369515026, 98, 2882, 819.0, 1005.0, 1054.65, 1906.7300000000155, 9.535869625061938, 8.483571512140065, 0.0], "isController": false}, {"data": ["S1-TG1 - POST /auth/login (Renter)", 397, 0, 0.0, 438.9924433249368, 99, 967, 455.0, 633.0, 693.0999999999999, 824.2599999999989, 6.7158371959265155, 5.974734067860406, 0.0], "isController": false}, {"data": ["S1-TG3 - PATCH /notifications/read-all", 347, 0, 0.0, 635.6167146974062, 154, 2078, 636.0, 810.2, 1095.399999999993, 1996.6399999999999, 5.904172054719934, 1.758566871767168, 0.0], "isController": false}, {"data": ["S1-TG1 - POST /bookings", 385, 0, 0.0, 1987.1584415584414, 439, 3097, 2195.0, 2574.8, 2706.7, 2922.24, 6.48781638637053, 10.614238097595296, 0.0], "isController": false}, {"data": ["S4-TG1 - POST /auth/login (Renter)", 857, 0, 0.0, 1519.0291715285869, 131, 2551, 1792.0, 2117.4, 2254.6999999999994, 2484.659999999999, 9.333275249940101, 8.303333742866633, 0.0], "isController": false}, {"data": ["S1-TG2 - PATCH /owner/bookings/:id/approve", 216, 60, 27.77777777777778, 3321.1759259259256, 119, 7938, 3405.0, 5808.8, 6437.15, 7872.209999999994, 3.428244929054376, 4.457722776402248, 0.0], "isController": false}, {"data": ["S2-TG4 - POST /auth/login (Admin)", 115, 0, 0.0, 287.7478260869565, 95, 1070, 270.0, 472.8000000000001, 537.0, 1058.6400000000003, 1.283668389386853, 1.145774324120687, 0.0], "isController": false}, {"data": ["S2-TG3 - GET /notifications", 786, 0, 0.0, 1976.7086513994916, 146, 4057, 2126.5, 2489.3, 2642.8999999999996, 3992.39, 8.84856126446616, 30.341005756912235, 0.0], "isController": false}, {"data": ["S4-TG1 - GET /vehicles/available", 839, 0, 0.0, 2872.3134684147794, 121, 4391, 3472.0, 3964.0, 4090.0, 4315.6, 9.114611624117327, 157.7700107787887, 0.0], "isController": false}, {"data": ["S1-TG3 - POST /auth/login (Renter)", 390, 0, 0.0, 373.3128205128202, 104, 1250, 362.5, 534.6000000000001, 632.3499999999992, 1015.3099999999986, 6.494371544661293, 5.777707497252381, 0.0], "isController": false}, {"data": ["S1-TG3 - GET /reviews/vehicle/:vehicleID", 373, 0, 0.0, 518.5764075067026, 79, 1875, 515.0, 706.2, 1183.8000000000009, 1649.2799999999988, 6.2315184523113425, 1.7587000319511503, 0.0], "isController": false}, {"data": ["S3-TG2 - GET /vehicles/my-vehicles", 227, 0, 0.0, 6420.136563876649, 107, 17558, 7489.0, 10389.200000000003, 12166.199999999999, 16949.04, 2.531560868983361, 104.66669190444193, 0.0], "isController": false}, {"data": ["S1-TG1 - GET /vehicles/:vehicleID", 389, 0, 0.0, 684.0359897172236, 83, 1132, 763.0, 947.0, 1002.5, 1078.0, 6.702389772394424, 7.731920427428109, 0.0], "isController": false}, {"data": ["S1-TG1 - GET /vehicles/available", 395, 0, 0.0, 695.4962025316454, 75, 1229, 761.0, 983.0, 1036.1999999999998, 1098.6000000000008, 6.726381036714121, 116.43076550366972, 0.0], "isController": false}, {"data": ["S1-TG4 - POST /auth/login (Admin)", 78, 0, 0.0, 294.897435897436, 96, 661, 300.0, 424.80000000000024, 478.15, 661.0, 1.299913339110726, 1.160274210885941, 0.0], "isController": false}, {"data": ["S1-TG3 - GET /notifications", 355, 0, 0.0, 777.5549295774642, 109, 2682, 832.0, 1060.8000000000002, 1411.599999999998, 2338.999999999999, 6.006666553865417, 20.257644884392818, 0.0], "isController": false}]}, function(index, item){
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
    createTable($("#errorsTable"), {"supportsControllersDiscrimination": false, "titles": ["Type of error", "Number of errors", "% in errors", "% in all samples"], "items": [{"data": ["400/Bad Request", 195, 19.877675840978593, 0.962202704036317], "isController": false}, {"data": ["500/Internal Server Error", 381, 38.837920489296636, 1.879996052501727], "isController": false}, {"data": ["401/Unauthorized", 352, 35.881753312945975, 1.7368992401065824], "isController": false}, {"data": ["409/Conflict", 53, 5.402650356778797, 0.26152176058422977], "isController": false}]}, function(index, item){
        switch(index){
            case 2:
            case 3:
                item = item.toFixed(2) + '%';
                break;
        }
        return item;
    }, [[1, 1]]);

        // Create top5 errors by sampler
    createTable($("#top5ErrorsBySamplerTable"), {"supportsControllersDiscrimination": false, "overall": {"data": ["Total", 20266, 981, "500/Internal Server Error", 381, "401/Unauthorized", 352, "400/Bad Request", 195, "409/Conflict", 53, "", ""], "isController": false}, "titles": ["Sample", "#Samples", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors"], "items": [{"data": [], "isController": false}, {"data": ["S2-TG2 - GET /owner/bookings", 40, 40, "401/Unauthorized", 40, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["S2-TG2 - PATCH /owner/bookings/:id/approve", 40, 40, "401/Unauthorized", 40, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["S2-TG2 - GET /vehicles/my-vehicles", 40, 40, "401/Unauthorized", 40, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["S2-TG1 - POST /bookings", 96, 96, "401/Unauthorized", 96, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["S2-TG1 - GET /vehicles/available", 134, 134, "500/Internal Server Error", 134, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["S2-TG2 - GET /owner/bookings?status=PENDING", 40, 40, "401/Unauthorized", 40, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["S2-TG1 - GET /bookings", 96, 96, "401/Unauthorized", 96, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["S3-TG2 - PATCH /owner/bookings/:id/approve", 189, 97, "400/Bad Request", 97, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["S2-TG1 - POST /auth/login (Renter)", 196, 196, "500/Internal Server Error", 196, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["S2-TG2 - POST /auth/login (Owner)", 140, 51, "500/Internal Server Error", 51, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["S3-TG1 - POST /bookings", 640, 10, "409/Conflict", 10, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["S4-TG2 - PATCH /owner/bookings/:id/approve", 121, 38, "400/Bad Request", 38, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["S4-TG1 - POST /bookings", 813, 43, "409/Conflict", 43, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["S1-TG2 - PATCH /owner/bookings/:id/approve", 216, 60, "400/Bad Request", 60, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}]}, function(index, item){
        return item;
    }, [[0, 0]], 0);

});
