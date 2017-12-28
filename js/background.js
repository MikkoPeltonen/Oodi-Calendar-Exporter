// Google Calendar API base URL
const baseUrl = "https://www.googleapis.com/calendar/v3";

/**
 * Make an authenticated XHR request to a given url. If the request fails with
 * 401 Unauthorized status code, the function will retry once more after
 * acquiring a new OAuth token.
 *
 * @param  {String}   method   HTTP method, e.g. POST
 * @param  {String}   url      URL to request
 * @param  {Function} callback Callback for results
 */
function authenticatedXhr(method, url, json, callback) {
  var retry = true;

  function makeRequest() {
    // Get authentication token
    chrome.identity.getAuthToken({ "interactive": true }, function (token) {
      if (chrome.runtime.lastError) {
        callback(chrome.runtime.lastError);
        return;
      }

      // Make XHR request
      var xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.setRequestHeader("Authorization", "Bearer " + token);

      xhr.onload = function () {
        // If unauthorized, try again after removing the cached token.
        if (this.status === 401 && retry) {
          retry = false;
          chrome.identity.removeCachedAuthToken({ "token": token }, makeRequest);
          return;
        }

        // Success, invoke callback
        callback(null, this.status, this.responseText);
      }

      if (json !== null) {
        xhr.setRequestHeader("Content-type", "application/json");
        xhr.send(JSON.stringify(json));
      } else {
        xhr.send();
      }
    });
  }

  makeRequest();
}

/**
 * Request a list of calendars that are editable by the user.
 *
 * @param  {Function} calendarListCallback Callback that is invoked when a list
 *                                         of calendars is received.
 */
function getCalendarList(calendarListCallback) {
  // Get a list of calendars available
  authenticatedXhr("GET", baseUrl + "/users/me/calendarList", null, function (error, status, response) {
    if (status === 200) {
      var json = JSON.parse(response);
      var calendars = json.items.filter(calendar => calendar.accessRole === "owner");

      calendarListCallback(calendars);
    }
  });
}

/**
 * Create events in the selected calendar
 *
 * @param  {Array}    events    Array of events
 * @param  {Function} callback  Callback to invoke after all XHR requests
 */
function createEvents(events, callback) {
  var requestResponses = 0;
  var allSuccessful = true;

  // Get calendar id. This is set, no need to do error checking.
  chrome.storage.sync.get("defaultCalendarId", function (items) {
    if (items.hasOwnProperty("defaultCalendarId")) {
      var calendarId = items["defaultCalendarId"];

      // Post each event separately
      events.forEach(function (event) {
        authenticatedXhr("POST", baseUrl + "/calendars/" + calendarId + "/events", event, function (error, status, response) {
          requestResponses++;

          if (status !== 200) {
            allSuccessful = false;
          }

          // When all XHR requests have completed, notify the listener
          if (requestResponses === events.length) {
            callback(allSuccessful);
          }
        });
      });
    }
  });
}

// Handle incoming actions
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "addToCalendar") {
    createEvents(request.googleCalendarEvents, function (success) {
      sendResponse(success);
    });

    // True must be returned to be able to call sendResponse asynchronously
    return true;
  } else if (request.action === "getCalendarList") {
    getCalendarList(function (calendars) {
      sendResponse(calendars);
    });

    return true;
  }
});
