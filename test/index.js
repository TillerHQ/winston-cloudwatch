describe('winston-cloudwatch', function() {

  var sinon = require('sinon'),
      should = require('should'),
      mockery = require('mockery');

  var stubbedTransport = function() {
  };
  stubbedTransport.prototype.emit = sinon.spy();

  var stubbedWinston = {
    Transport: stubbedTransport,
  };

  var stubbedAWS = {
    CloudWatchLogs: function() {}
  };

  var stubbedCloudwatchIntegration = {
    upload: sinon.spy(function(aws, groupName, streamName, logEvents, cb) {
      this.lastLoggedEvents = logEvents.splice(0, 20);
      cb(stubbedCloudwatchIntegration.error);
    })
  };
  var clock = sinon.useFakeTimers();

  var WinstonCloudWatch;

  before(function() {
    mockery.enable();
    mockery.registerAllowable('util');

    mockery.registerMock('winston', stubbedWinston);
    mockery.registerMock('aws-sdk', stubbedAWS);
    mockery.registerMock('./lib/cloudwatch-integration', stubbedCloudwatchIntegration);

    mockery.registerAllowable('../index.js');
    WinstonCloudWatch = require('../index.js');

  });

  after(function() {
    mockery.deregisterAll();
    mockery.disable();
  });

  describe('log', function() {
    describe('as json', function() {
      var transport;
      var options = {
        jsonMessage: true
      };
      before(function(done) {
        transport = new WinstonCloudWatch(options);
        transport.log('level', 'message', {key: 'value'}, function() {
          clock.tick(2000);
          done();
        });
      });
      it('logs json', function() {
        var message = stubbedCloudwatchIntegration.lastLoggedEvents[0].message;
        var jsonMessage = JSON.parse(message);
        jsonMessage.level.should.equal('level');
        jsonMessage.msg.should.equal('message');
        jsonMessage.meta.key.should.equal('value');
      });
    });
    describe('as text', function() {
      var transport;
      describe('using the default formatter', function() {
        var options = {};
        describe('with metadata', function() {
          var meta = {key: 'value'};
          before(function(done) {
            transport = new WinstonCloudWatch(options);
            transport.log('level', 'message', meta, done);
            clock.tick(2000);
          });
          it('logs text', function() {
            var message = stubbedCloudwatchIntegration.lastLoggedEvents[0].message;
            message.should.equal('level - message - {\n  "key": "value"\n}');
          });
        });
        describe('without metadata', function() {
          var meta = {};
          before(function(done) {
            transport = new WinstonCloudWatch(options);
            transport.log('level', 'message', {}, done);
            clock.tick(2000);
          });
          it('logs text', function() {
            var message = stubbedCloudwatchIntegration.lastLoggedEvents[0].message;
            message.should.equal('level - message - {}');
          });
        });
      });
      describe('using a custom formatter', function() {
        var options = {
          messageFormatter: function(log) {
            return 'custom formatted log message';
          }
        };
        before(function(done) {
          transport = new WinstonCloudWatch(options);
          transport.log('level', 'message', {key: 'value'}, done);
          clock.tick(2000);
        });
        it('logs text', function() {
          var message = stubbedCloudwatchIntegration.lastLoggedEvents[0].message;
          message.should.equal('custom formatted log message');
        });
      });
    });

    describe('handles error', function() {

      before(function() {
        stubbedCloudwatchIntegration.error = 'ERROR';
        sinon.stub(console, 'error');
      });

      after(function() {
        delete stubbedCloudwatchIntegration.error;
        console.error.restore();
      });

      it('invoking errorHandler if provided', function() {
        var errorHandlerSpy = sinon.spy();
        var transport = new WinstonCloudWatch({
          errorHandler: errorHandlerSpy
        });
        transport.add({});
        clock.tick(2000);
        errorHandlerSpy.args[0][0].should.equal('ERROR');
      });

      it('console.error if errorHandler is not provided', function() {
        var transport = new WinstonCloudWatch({});
        transport.add({});
        clock.tick(2000);
        console.error.args[0][0].should.equal('ERROR');
      });

    });
  });
  describe('close', function() {
    var transport;
    context('when empty', function() {
      before(function() {
        transport = new WinstonCloudWatch({});
        stubbedCloudwatchIntegration.upload.reset();
        transport.emit.reset();
        transport.close();
      });
      it('does not try to upload anything', function() {
        stubbedCloudwatchIntegration.upload.calledOnce.should.equal(false);
      });
      it('emits a flush event', function() {
        transport.emit.calledWith('flush').should.equal(true);
      });
      it('emits a closed event', function() {
        transport.emit.calledWith('close').should.equal(true);
      });
    });
    context('when there are log messages in the queue', function() {
      before(function(done) {
        transport = new WinstonCloudWatch({});
        stubbedCloudwatchIntegration.upload.reset();
        transport.emit.reset();
        transport.log('level', 'message', {}, function() {
          transport.close();
          done();
        });
      });
      it('uploads outstanding logs immediately', function() {
        stubbedCloudwatchIntegration.upload.calledOnce.should.equal(true);
      });
      it('emits a flush event', function() {
        transport.emit.calledWith('flush').should.equal(true);
      });
      it('emits a closed event', function() {
        transport.emit.calledWith('close').should.equal(true);
      });
    });
  });
});
