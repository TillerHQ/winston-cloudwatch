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
      cb();
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

      beforeEach(function() {
        stubbedCloudwatchIntegration.upload = sinon.stub().yields('ERROR');
        mockery.registerMock('./lib/cloudwatch-integration', stubbedCloudwatchIntegration);
        sinon.stub(console, 'error');
      });

      afterEach(function() {
        stubbedCloudwatchIntegration = {
          upload: sinon.spy()
        };
        mockery.registerMock('./lib/cloudwatch-integration', stubbedCloudwatchIntegration);
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
    before(function() {
      transport = new WinstonCloudWatch({});
      stubbedCloudwatchIntegration.upload.reset();
      transport.emit.reset();
      transport.close();
    });
    it('uploads outstanding logs immediately', function() {
      stubbedCloudwatchIntegration.upload.should.be.calledOnce;
    });
    it('emits a flush event', function() {
      transport.emit.calledWith('flush').should.be.true;
    });
    it('emites a closed event', function() {
      transport.emit.calledWith('close').should.be.true;
    });
  });
});
