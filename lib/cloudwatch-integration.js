var _ = require('lodash'),
    async = require('async');

var lib = {};

// Constraints per http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html
const AWS_PUTLOGEVENTS_MAX_BATCHSIZE = 10000;

lib.upload = function(aws, groupName, streamName, logEvents, cb) {
  lib.getToken(aws, groupName, streamName, function(err, token) {
    if (err) {
      return cb(err);
    }

    // NOTE! By inspection, the following check for no log events may seem redundant to
    // a similary check by the caller, but it is actually critical to check in both places.
    // The caller's check is an optimization, to prevent us from calling getToken()
    // unneccessarily if there is no work to do (thereby increasing our API usage and possibly
    // resulting in throttling exception). This check, however, is to prevent us from making
    // the putLogEvents API call when there are no log events, which would result in
    // InvalidParameterException.
    //
    //  Note that calls to upload() can occur at a greater frequency
    // than getToken() responses are processed. By way of example, consider if add() is
    // called at 0s and 1.1s, each time with a single event, and upload() is called
    // at 1.0s and 2.0s, with the same logEvents array, but calls to getToken()
    // take 1.5s to return. When the first call to getToken() DOES return,
    // it will send both events and empty the array. Then, when the second call
    // go getToken() returns, without this check also here, it would attempt to send
    // an empty array, resulting in the InvalidParameterException.
    if (logEvents.length <= 0) {
      return cb();
    }

    var payload = {
      logGroupName: groupName,
      logStreamName: streamName,
      logEvents: logEvents.splice(0, AWS_PUTLOGEVENTS_MAX_BATCHSIZE)
    };
    if (token) payload.sequenceToken = token;

    aws.putLogEvents(payload, cb);
  });
};

lib.getToken = function(aws, groupName, streamName, cb) {
  async.series([
    lib.ensureGroupPresent.bind(null, aws, groupName),
    lib.getStream.bind(null, aws, groupName, streamName)
  ], function(err, resources) {
    var groupPresent = resources[0],
        stream = resources[1];
    if (groupPresent && stream) {
      cb(err, stream.uploadSequenceToken);
    } else {
      cb(err);
    }
  });
};

lib.ensureGroupPresent = function ensureGroupPresent(aws, name, cb) {
  var params = { logGroupName: name };
  aws.describeLogStreams(params, function(err, data) {
    if (err && err.code == 'ResourceNotFoundException') {
      return aws.createLogGroup(params, lib.ignoreInProgress(function(err) {
        cb(err, err ? false : true);
      }));
    } else {
      cb(err, true);
    }
  });
};

lib.getStream = function getStream(aws, groupName, streamName, cb) {
  var params = { logGroupName: groupName };

  aws.describeLogStreams(params, function(err, data) {
    if (err) return cb(err);

    var stream = _.find(data.logStreams, function(stream) {
      return stream.logStreamName === streamName;
    });

    if (!stream) {
      aws.createLogStream({
        logGroupName: groupName,
        logStreamName: streamName
      }, lib.ignoreInProgress(function(err, data) {
        if (err) return cb(err);
        getStream(aws, groupName, streamName, cb);
      }));
    } else {
      cb(null, stream);
    }
  });
};

lib.ignoreInProgress = function ignoreInProgress(cb) {
  return function(err, data) {
    if (err && (err.code == 'OperationAbortedException' ||
                err.code == 'ResourceAlreadyExistsException')) {
      cb(null, data);
    } else {
      cb(err, data);
    }
  };
};

module.exports = lib;
