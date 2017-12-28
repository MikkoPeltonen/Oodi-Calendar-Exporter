var $select = $("select[name='target_calendar']").first();
var $calendarSelectContainer = $("#calendars_container");
var $calendarsNotFound = $("#calendars_not_found");
var $loader = $("#loader");

/**
 * Set the default calendar id, i.e. the calendar in which the events are
 * exported to.
 *
 * @param {string} calendarId Calendar id
 */
function setDefaultCalendarId(calendarId) {
  chrome.storage.sync.set({ "defaultCalendarId": calendarId }, function () {});
}

// Get the default calendar id from storage
var defaultCalendarId = null;
chrome.storage.sync.get("defaultCalendarId", function (items) {
  if (items.hasOwnProperty("defaultCalendarId")) {
    defaultCalendarId = items["defaultCalendarId"];
  }
});

// When the calendar dropdown value is changed, update the default calendar id
$select.change(function () {
  defaultCalendarId = $select.find("option:selected").val();
  setDefaultCalendarId(defaultCalendarId);

  $(this).blur();
});

// When the popup is opened, load available calendars
var startTime = (new Date()).getMilliseconds();
chrome.runtime.sendMessage({ action: "getCalendarList" }, function (calendars) {
  // When loaded, hide the loading animation and display appropriate content.
  // Timeout is used to reduce flashing with quick responses.
  var duration = (new Date()).getMilliseconds() - startTime;
  setTimeout(function () {
    $loader.fadeOut(400, function () {
      if (calendars.length) {
        $calendarSelectContainer.fadeIn();
      } else {
        $calendarsNotFound.fadeIn();
      }
    });
  }, Math.max(0, 500 - duration));

  // Append calendar options to select container
  calendars.forEach(function (calendar) {
    // If default calendar id is not set, use the first calendar
    if (defaultCalendarId === null) {
      setDefaultCalendarId(calendar.id);
      defaultCalendarId = calendar.id;
    }

    var $option = $("<option></option>");
    $option.attr("value", calendar.id);
    $option.text(calendar.summary);

    if (defaultCalendarId === calendar.id) {
      $option.attr("selected", true);
    }

    $select.append($option);
  });
});
