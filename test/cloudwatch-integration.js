describe('cloudwatch-integration', function() {

  var lib = require('../lib/cloudwatch-integration'),
      sinon = require('sinon'),
      should = require('should');


  describe('upload', function() {

    var aws = {};

    beforeEach(function() {
      aws.putLogEvents = sinon.stub().yields();
      sinon.stub(lib, 'getToken').yields(null, 'token');
      sinon.stub(console, 'error');
    });

    afterEach(function() {
      lib.getToken.restore();
      console.error.restore();
    });

    it('puts log events', function(done) {
      lib.upload(aws, 'group', 'stream', Array(20), function() {
        aws.putLogEvents.calledOnce.should.equal(true);
        aws.putLogEvents.args[0][0].logGroupName.should.equal('group');
        aws.putLogEvents.args[0][0].logStreamName.should.equal('stream');
        aws.putLogEvents.args[0][0].logEvents.length.should.equal(20);
        aws.putLogEvents.args[0][0].sequenceToken.should.equal('token');
        done();
      });
    });

    it('limits log events to the AWS constraint', function(done) {
      lib.upload(aws, 'group', 'stream', Array(20000), function() {
        aws.putLogEvents.calledOnce.should.equal(true);
        aws.putLogEvents.args[0][0].logGroupName.should.equal('group');
        aws.putLogEvents.args[0][0].logStreamName.should.equal('stream');
        aws.putLogEvents.args[0][0].logEvents.length.should.equal(10000);
        aws.putLogEvents.args[0][0].sequenceToken.should.equal('token');
        done();
      });
    });

    it('adds token to the payload only if it exists', function(done) {
      lib.getToken.yields(null);
      lib.upload(aws, 'group', 'stream', Array(20), function() {
        aws.putLogEvents.calledOnce.should.equal(true);
        aws.putLogEvents.args[0][0].logGroupName.should.equal('group');
        aws.putLogEvents.args[0][0].logStreamName.should.equal('stream');
        aws.putLogEvents.args[0][0].logEvents.length.should.equal(20);
        should.not.exist(aws.putLogEvents.args[0][0].sequenceToken);
        done();
      });
    });

    it('does not put if events are empty', function(done) {
      lib.upload(aws, 'group', 'stream', [], function() {
        aws.putLogEvents.called.should.equal(false);
        done();
      });
    });

    it('errors if getting the token errors', function(done) {
      lib.getToken.yields('err');
      lib.upload(aws, 'group', 'stream', Array(20), function(err) {
        err.should.equal('err');
        done();
      });
    });

    it('errors if putting log events errors', function(done) {
      aws.putLogEvents.yields('err');
      lib.upload(aws, 'group', 'stream', Array(20), function(err) {
        err.should.equal('err');
        done();
      });

    });

  });

  describe('getToken', function() {

    var aws;

    beforeEach(function() {
      sinon.stub(lib, 'ensureGroupPresent').yields();
      sinon.stub(lib, 'getStream').yields();
    });

    afterEach(function() {
      lib.ensureGroupPresent.restore();
      lib.getStream.restore();
    });

    it('ensures group and stream are present', function(done) {
      lib.getToken(aws, 'group', 'stream', function() {
        lib.ensureGroupPresent.calledOnce.should.equal(true);
        lib.getStream.calledOnce.should.equal(true);
        done();
      });
    });

    it('yields token when group and stream are present', function(done) {
      lib.ensureGroupPresent.yields(null, true);
      lib.getStream.yields(null, {
        uploadSequenceToken: 'token'
      });
      lib.getToken(aws, 'group', 'stream', function(err, token) {
        should.not.exist(err);
        token.should.equal('token');
        done();
      });
    });

    it('errors when ensuring group errors', function(done) {
      lib.ensureGroupPresent.yields('err');
      lib.getToken(aws, 'group', 'stream', function(err) {
        err.should.equal('err');
        done();
      });
    });

    it('errors when ensuring stream errors', function(done) {
      lib.getStream.yields('err');
      lib.getToken(aws, 'group', 'stream', function(err) {
        err.should.equal('err');
        done();
      });
    });

  });

  describe('ensureGroupPresent', function() {

    var aws;

    beforeEach(function() {
      aws = {
        describeLogStreams: function(params, cb) {
          cb(null, {});
        }
      };
    });

    it('makes sure that a group is present', function(done) {
      lib.ensureGroupPresent(aws, 'group', function(err, isPresent) {
        should.not.exist(err);
        isPresent.should.equal(true);
        done();
      });
    });

    it('creates a group if it is not present', function(done) {
      var err = { code: 'ResourceNotFoundException' };
      aws.describeLogStreams = sinon.stub().yields(err);
      aws.createLogGroup = sinon.stub().yields(null);

      lib.ensureGroupPresent(aws, 'group', function(err, isPresent) {
        should.not.exist(err);
        isPresent.should.equal(true);
        done();
      });
    });

    it('errors if looking for a group errors', function(done) {
      aws.describeLogStreams = sinon.stub().yields('err');

      lib.ensureGroupPresent(aws, 'group', function(err) {
        err.should.equal('err');
        done();
      });
    });

    it('errors if creating a group errors', function(done) {
      var err = { code: 'ResourceNotFoundException' };
      aws.describeLogStreams = sinon.stub().yields(err);
      aws.createLogGroup = sinon.stub().yields('err');

      lib.ensureGroupPresent(aws, 'group', function(err) {
        err.should.equal('err');
        done();
      });
    });

  });

  describe('getStream', function() {

    var aws;

    beforeEach(function() {
      aws = {
        describeLogStreams: function(params, cb) {
          cb(null, {
            logStreams: [{
              logStreamName: 'stream'
            }, {
              logStreamName: 'another-stream'
            }]
          });
        }
      };
    });

    it('yields the stream we want', function(done) {
      lib.getStream(aws, 'group', 'stream', function(err, stream) {
        stream.logStreamName.should.equal('stream');
        done();
      });
    });

    it('errors if getting streams errors', function(done) {
      aws.describeLogStreams = function(params, cb) {
        cb('err');
      };

      lib.getStream(aws, 'group', 'stream', function(err, stream) {
        should.not.exist(stream);
        err.should.equal('err');
        done();
      });
    });

    it('errors if creating stream errors', function(done) {
      aws.describeLogStreams = sinon.stub().yields(null, []);
      aws.createLogStream = function(params, cb) {
        cb('err');
      };

      lib.getStream(aws, 'group', 'stream', function(err, stream) {
        should.not.exist(stream);
        err.should.equal('err');
        done();
      });
    });

    it('ignores in progress error (aborted)', function(done) {
      aws.describeLogStreams = sinon.stub();
      aws.describeLogStreams
        .onCall(0).yields(null, [])
        .onCall(1).yields(null, {
          logStreams: [{
            logStreamName: 'stream'
          }, {
            logStreamName: 'another-stream'
          }]
        });
      var err = { code: 'OperationAbortedException' };
      aws.createLogStream = sinon.stub().yields(err);

      lib.getStream(aws, 'group', 'stream', function(err, stream) {
        should.exist({ logStreamName: 'stream' });
        should.not.exist(err);
        done();
      });
    });

    it('ignores in progress error (already exist)', function(done) {
      aws.describeLogStreams = sinon.stub();
      aws.describeLogStreams
        .onCall(0).yields(null, [])
        .onCall(1).yields(null, {
          logStreams: [{
            logStreamName: 'stream'
          }, {
            logStreamName: 'another-stream'
          }]
        });
      err = { code: 'ResourceAlreadyExistsException' };
      aws.createLogStream = sinon.stub().yields(err);

      lib.getStream(aws, 'group', 'stream', function(err, stream) {
        should.exist({ logStreamName: 'stream' });
        should.not.exist(err);
        done();
      });
    });

  });

  describe('ignoreInProgress', function() {

    it('can be used to filter callback errors', function(done) {
      function typicalCallback(err, result) {
        err.should.equal('err');
        result.should.equal('result');
        done();
      }

      var filter = lib.ignoreInProgress(typicalCallback);
      filter.should.be.an.instanceOf(Function);
      filter('err', 'result');
    });

    it('ignores a OperationAbortedException', function(done) {
      function runner(cb) {
        var err = { code: 'OperationAbortedException' };
        cb(err);
      }

      runner(lib.ignoreInProgress(function(err) {
        should.not.exist(err);
        done();
      }));
    });

    it('ignores a ResourceAlreadyExistsException', function(done) {
      function runner(cb) {
        var err = { code: 'ResourceAlreadyExistsException' };
        cb(err);
      }

      runner(lib.ignoreInProgress(function(err) {
        should.not.exist(err);
        done();
      }));
    });

    it('does not ignore any other error', function(done) {
      function runner(cb) {
        var err = { code: 'BoatTooLittleException' };
        cb(err);
      }

      runner(lib.ignoreInProgress(function(err) {
        should.exist(err);
        err.code.should.equal('BoatTooLittleException');
        done();
      }));

    });
  });

});
