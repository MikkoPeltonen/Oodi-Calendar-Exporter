var events = [];

/**
 * Convert DD.MM.YY to Date object
 *
 * @param  {String} str String date
 * @return {Date}       Date object
 */
function strToDate(str) {
  var dateParts = str.split(".").map(Number);
  return new Date(2000 + dateParts[2], dateParts[1] - 1, dateParts[0]);
}

/**
 * Format a Date object to YYYY-MM-DDTHH:MM:00
 *
 * @param  {Date} date Date object to format
 * @return {String}    Date string
 */
function formatDateTime(date) {
  return date.getFullYear() + "-" +
         ("0" + (date.getMonth() + 1)).slice(-2) + "-" +
         ("0" + date.getDate()).slice(-2) + "T" +
         ("0" + date.getHours()).slice(-2) + ":" +
         ("0" + date.getMinutes()).slice(-2) + ":00";
}

/**
 * Convert simplied parsed event data from Oodi to valid Google Calendar API
 * request format.
 *
 * @param  {Array} event Event to convert
 * @return {Array}       Converted events
 */
function makeGoogleCalendarEvent(event) {
  var events = [];

  // Each different time range must be posted as a separate event
  event.schedule.forEach(function (period) {
    // Datetime (start time) of the first event occurrance
    var startDateTime = new Date(period.startDate.getTime());
    startDateTime.setHours(period.startTime[0]);
    startDateTime.setMinutes(period.startTime[1]);

    // ... and end time
    var endDateTime = new Date(period.startDate.getTime());
    endDateTime.setHours(period.endTime[0]);
    endDateTime.setMinutes(period.endTime[1]);

    var googleCalendarEvent = {
      summary: event.name,
      location: period.room,
      start: {
        dateTime: formatDateTime(startDateTime),
        timeZone: "Europe/Helsinki",
      },
      end: {
        dateTime: formatDateTime(endDateTime),
        timeZone: "Europe/Helsinki",
      },
    };

    // If start and end dates differ, a recurring event is created
    if (period.startDate.getTime() !== period.endDate.getTime()) {
      googleCalendarEvent.recurrence = [
        "RRULE:FREQ=WEEKLY;UNTIL=" +
        period.endDate.getFullYear().toString() +
        ("0" + (period.endDate.getMonth() + 1).toString()).slice(-2) +
        ("0" + (period.endDate.getDate() + 1).toString()).slice(-2) +
        "T000000Z"
      ];
    }

    events.push(googleCalendarEvent);
  });

  return events;
}

/**
 * Add to Calendar button callback
 */
function addToCalendar() {
  var eventIndex = $(this).data("event-index");
  var event = events[eventIndex];

  chrome.storage.sync.get("defaultCalendarName", function (items) {
    var calendarName = items["defaultCalendarName"];

    // If calendar name is not defined, a default calendar has not been selected.
    if (calendarName === undefined) {
      alertify.alert("You haven't selected a calendar. Open the settings window and choose a calendar.");
      return;
    }

    alertify
      .okBtn("Add events")
      .cancelBtn("Cancel")
      .placeholder("Add custom event name")
      .prompt("Are you sure you want to add the following events to calendar " + calendarName + "?<br><br>" + event.name, function (value, evt) {
        evt.preventDefault();

        // Update event name if input value was changed
        if (value !== "") {
          event.name = value;
        }

        // Get a JSON representation of the event in a Google Calendar API format
        var googleCalendarEvents = makeGoogleCalendarEvent(event);

        // Sending an authenticated XHR request requires an OAuth token. Therefore we
        // must do it in a background script because content scripts don't have
        // access to that information.
        chrome.runtime.sendMessage({ action: "addToCalendar", googleCalendarEvents }, function (success) {
          if (success) {
            alertify.logPosition("bottom right").success("Events were added to your calendar!");
          } else {
            alertify.logPosition("bottom right").error("Oops! I couldn't add all events to your calendar.");
          }
        });
      }, function (evt) {
        evt.preventDefault();
      });

    // Prevent input focus on prompt open
    setTimeout(function () {
      $(".alertify .dialog input").blur();
    }, 100);
  });
}


// Basic course details
var courseDetails = $("div.tauluotsikko").eq(0).text().split(",").map((str) => str.trim());
var courseCode = courseDetails[0];
var courseName = courseDetails[1];

// Get all rows containing event data
var $rows = $("table.kll > tbody > tr").filter(function () {
  return $(this).find("> td").length == 2;
});

$rows.each(function (index) {
  var $tds = $(this).find("> td").eq(1).find("> table > tbody > tr > td");

  var eventType = $(this).closest("table.kll").eq(0).find("tr:eq(0) > th tbody:eq(1) > tr:eq(1) > th:eq(0)").text().trim();
  var name = $tds.eq(0).text().trim();

  var evt = {
    name: eventType + " " + name + " (" + courseCode + " " + courseName + ")",
    schedule: [],
  };

  // Go through the last td to find all event times
  $tds.eq(2).find("td").each(function () {
    var $td = $(this);
    var content = $(this).html();
    var dates = content.match(/[^<]*/i)[0].trim().split("-");

    var startDate, endDate;

    if (dates.length === 1) {
      // Single day events
      startDate = strToDate(dates[0]);
      endDate = startDate;
    } else {
      // Date ranges
      startDate = strToDate(dates[0] + dates[1].split(".")[2]);
      endDate = strToDate(dates[1]);
    }

    var numberOfEvents = (content.match(/[0-9]-/g) || []).length;

    // Parse time ranges
    var timeRanges = (content.match(/[0-9]{2}.[0-9]{2}-[0-9]{2}.[0-9]{2}/g) || [])
                     .map((str) => str.replace("-", ".").trim().split(".").map(Number));

    timeRanges.forEach(function (timeRange, rangeIndex) {
      var startTime = [timeRange[0], timeRange[1]]; // [hh, mm]
      var endTime = [timeRange[2], timeRange[3]];
      var room = $td.find("input[type='submit']").eq(rangeIndex).val();

      evt.schedule.push({ startDate, endDate, startTime, endTime, room });
    });
  });

  if (evt.schedule.length) {
    // Insert a "Add to Google Calendar" button if there are dates in the row
    var $buttonContainer = $tds.eq(2);
    var $btn = $("<input type='button' value='Add to Google Calendar'>");

    $btn.data("event-index", events.length);

    $("<br>").appendTo($buttonContainer);
    $btn.appendTo($buttonContainer);
    $("<br><br>").appendTo($buttonContainer);

    $btn.click(addToCalendar);

    events.push(evt);
  }
});
