(function () {
    'use strict';

    var currentURL = window.location.href.toUpperCase();
    //if (currentURL.indexOf('/SITEPAGES/APP.ASPX') >= 0) {
        angular.element(document).ready(function () { angular.bootstrap(document, ['singlePageApp']); });
    //}

    var globalConfig = {
        appErrorPrefix: '[Exercise Application Error] ',
        appTitle: 'Exercise Application',
        baseUrl: 'http://localhost:3000/spa'
    };

    angular.module('singlePageApp', [
        'app.core',
        'app.data',
        'app.layout'
    ]);

    angular.module('app.core', [
        'officeuifabric.core',
        'officeuifabric.components',
        'ngAnimate',
        'ngSanitize',
        'ngResource',
        'blocks.exception',
        'blocks.logger',
        'blocks.router',
        'ui.calendar',
        'ui.router',
        'ngJsTree',
        'ngplus'
    ])
        .constant('_', _)
        .constant('toastr', toastr)
        .constant('moment', moment)
        .value('config', globalConfig)
        .config(configureCoreModule);

    angular.module('blocks.exception', [
        'blocks.logger'
    ])
        .factory('exception', exceptionService)
        .provider('exceptionHandler', exceptionHandlerProvider)
        .config(configureExceptionModule);

    angular.module('blocks.router', [
        'ui.router',
        'blocks.logger'
    ])
        .provider('routerHelper', routerHelperProvider);

    angular.module('blocks.logger', [])
        .factory('logger', loggerService);

    angular.module('app.layout', [
        'app.core'
    ])
        .controller('ShellController', ShellController);


    configureCoreModule.$inject = ['$logProvider', '$sceDelegateProvider', 'exceptionHandlerProvider', 'routerHelperProvider', 'toastr'];
    function configureCoreModule($logProvider, $sce, exceptionHandlerProvider, routerHelperProvider, toastr) {
        if ($logProvider.debugEnabled) {
            $logProvider.debugEnabled(true);
        }
        exceptionHandlerProvider.configure(globalConfig.appErrorPrefix);
        routerHelperProvider.configure({ docTitle: globalConfig.appTitle + ': ' });
        toastr.options.timeOut = 4000;
        toastr.options.positionClass = 'toast-bottom-right';

        //override security because our HTML templates violate CORS
	    $sce.resourceUrlWhitelist(['**']);
    }

    configureExceptionModule.$inject = ['$provide'];
    function configureExceptionModule($provide) {
        $provide.decorator('$exceptionHandler', extendExceptionHandler);
    }

    extendExceptionHandler.$inject = ['$delegate', 'exceptionHandler', 'logger'];
    function extendExceptionHandler($delegate, exceptionHandler, logger) {
        return function (exception, cause) {
            var appErrorPrefix = exceptionHandler.config.appErrorPrefix || '';
            var errorData = { exception: exception, cause: cause };
            exception.message = appErrorPrefix + exception.message;
            $delegate(exception, cause);
            logger.error(exception.message, errorData);
        };
    }

    routerHelperProvider.$inject = ['$locationProvider', '$stateProvider', '$urlRouterProvider'];
    function routerHelperProvider($locationProvider, $stateProvider, $urlRouterProvider) {
        /* jshint validthis:true */
        var config = {
            docTitle: undefined,
            resolveAlways: {}
        };

        if (!(window.history && window.history.pushState)) {
            window.location.hash = '/';
        }

        //$locationProvider.html5Mode(true);

        this.configure = function (cfg) {
            angular.extend(config, cfg);
        };

        this.$get = RouterHelper;
        RouterHelper.$inject = ['$location', '$rootScope', '$state', 'logger'];
        /* @ngInject */
        function RouterHelper($location, $rootScope, $state, logger) {
            var handlingStateChangeError = false;
            var hasOtherwise = false;
            var stateCounts = {
                errors: 0,
                changes: 0
            };

            var service = {
                configureStates: configureStates,
                getStates: getStates,
                stateCounts: stateCounts
            };

            init();

            return service;

            ///////////////

            function configureStates(states, otherwisePath) {
                states.forEach(function (state) {
                    state.config.resolve =
                        angular.extend(state.config.resolve || {}, config.resolveAlways);
                    $stateProvider.state(state.state, state.config);
                });
                if (otherwisePath && !hasOtherwise) {
                    hasOtherwise = true;
                    $urlRouterProvider.otherwise(otherwisePath);
                }
            }

            function handleRoutingErrors() {
                // Route cancellation:
                // On routing error, go to the dashboard.
                // Provide an exit clause if it tries to do it twice.
                $rootScope.$on('$stateChangeError',
                    function (event, toState, toParams, fromState, fromParams, error) {
                        if (handlingStateChangeError) {
                            return;
                        }
                        stateCounts.errors++;
                        handlingStateChangeError = true;
                        var destination = (toState &&
                            (toState.title || toState.name || toState.loadedTemplateUrl)) ||
                            'unknown target';
                        var msg = 'Error routing to ' + destination + '. ' +
                            (error.data || '') + '. <br/>' + (error.statusText || '') +
                            ': ' + (error.status || '');
                        logger.warning(msg, [toState]);
                        $location.path('/');
                    }
                );
            }

            function init() {
                handleRoutingErrors();
                updateDocTitle();
            }

            function getStates() { return $state.get(); }

            function updateDocTitle() {
                $rootScope.$on('$stateChangeSuccess',
                    function (event, toState, toParams, fromState, fromParams) {
                        stateCounts.changes++;
                        handlingStateChangeError = false;
                        var title = config.docTitle + ' ' + (toState.title || '');
                        $rootScope.title = title; // data bind to <title>
                    }
                );
            }
        }
    }

    function exceptionHandlerProvider() {
        /* jshint validthis:true */
        this.config = {
            appErrorPrefix: undefined
        };

        this.configure = function (appErrorPrefix) {
            this.config.appErrorPrefix = appErrorPrefix;
        };

        this.$get = function () {
            return { config: this.config };
        };
    }

    exceptionService.$inject = ['$q', 'logger'];
    function exceptionService($q, logger) {
        var service = {
            catcher: catcher
        };
        return service;

        function catcher(message) {
            return function (e) {
                var thrownDescription;
                var newMessage;
                if (e.data && e.data.description) {
                    thrownDescription = '\n' + e.data.description;
                    newMessage = message + thrownDescription;
                }
                e.data.description = newMessage;
                logger.error(newMessage);
                return $q.reject(e);
            };
        }
    }

    loggerService.$inject = ['$log', 'toastr'];
    function loggerService($log, toastr) {
        var service = {
            showToasts: true,

            error: error,
            info: info,
            success: success,
            warning: warning,

            // straight to console; bypass toastr
            log: $log.log
        };

        return service;
        /////////////////////

        function error(message, data, title) {
            toastr.error(message, title);
            $log.error('Error: ' + message, data);
        }

        function info(message, data, title) {
            toastr.info(message, title);
            $log.info('Info: ' + message, data);
        }

        function success(message, data, title) {
            toastr.success(message, title);
            $log.info('Success: ' + message, data);
        }

        function warning(message, data, title) {
            toastr.warning(message, title);
            $log.warn('Warning: ' + message, data);
        }
    }

    ShellController.$inject = ['$rootScope', '$timeout', 'config', 'logger'];
    function ShellController($rootScope, $timeout, config, logger) {
        var vm = this;
        vm.busyMessage = 'Please wait ...';
        vm.isBusy = true;
        $rootScope.showSplash = true;
        vm.navline = {
            title: config.appTitle,
            text: 'Created by John Papa',
            link: 'http://twitter.com/john_papa'
        };

        activate();

        function activate() {
            logger.success(config.appTitle + ' loaded!', null);
            hideSplash();
        }

        function hideSplash() {
            //Force a 1 second delay so we can see the splash.
            $timeout(function () {
                $rootScope.showSplash = false;
            }, 1000);
        }
    }

})();

(function () {
    'use strict';

    angular.module('app.models', [])
        .factory('RFI', RfiModel);

    RfiModel.$inject = ['RfiRepository'];
    function RfiModel(RfiRepository) {
        var RFI = function (data) {
            if (!data) {
                this.Id = undefined; //number
                this.Title = undefined; //string
                this.DateClosed = undefined; //string (ISO) or null "2016-08-01T07:00:00Z"
                this.Details = undefined; //string or null
                this.InsufficientExplanation = undefined; //string or null
                this.LTIOV = undefined; //string (ISO) or null "2016-08-01T07:00:00Z"
                this.ManageRFIId = undefined; // object or null {results: [8, 16, 23]}  
                this.MissionId = undefined; //integer or null
                this.PocNameId = undefined; //integer
                this.PocOrganization = undefined; //string
                this.PocPhone = undefined; //string
                this.Priority = undefined; //string
                this.RecommendedOPR = undefined; //string
                this.RespondentNameId = undefined; //integer or null
                this.RespondentPhone = undefined; //string or null
                this.ResponseSufficient = undefined; //string or null
                this.ResponseToRequest = undefined; //string or null
                this.RfiTrackingNumber = undefined; //integer or null
                this.Status = undefined; //string
                this.__metadata = {
                    type: "SP.Data.RfiListItem"
                };
            } else {
                for (var prop in data) {
                    if (data.hasOwnProperty(prop)) {
                        this[prop] = data[prop];
                    }
                }
            }
        }

        RFI.prototype.complete = function () {
            console.log('business object saving...');
            RfiRepository.save(this);
        }

        return RFI;
    }
})();

(function () {
    'use strict';

    angular.module('app.data', ['app.models'])
        .service('spContext', spContext)
        .service('RfiRepository', RfiRepository)
        .run(['spContext', function (spContext) {
            //simply requiring this singleton runs it initialization code..
        }]);


    RfiRepository.$inject = ['$http', '$q', '$resource', 'exception', 'logger', 'spContext'];
    function RfiRepository($http, $q, $resource, exception, logger, spContext) {
        var service = {
            getAll: getAll,
            save: save
        };

        var fieldsToSelect = [
            spContext.SP2013REST.selectForCommonFields,
            'Status,RfiTrackingNumber,MissionId,Details,Priority,LTIOV,PocNameId,PocPhone,PocOrganization,RecommendedOPR',
            'ManageRFIId,RespondentNameId,RespondentPhone,ResponseToRequest,DateClosed,ResponseSufficient,InsufficientExplanation',
            'Mission/FullName,PocName/Title,ManageRFI/Title,RespondentName/Title'
        ].join(',');

        var fieldsToExpand = [
            spContext.SP2013REST.expandoForCommonFields,
            'Mission,PocName,ManageRFI,RespondentName'
        ].join(',');

        function getDataContextForCollection(params) {
            return $resource(_spPageContextInfo.webServerRelativeUrl + "/_api/web/lists/getbytitle('RFI')/items",
                {},
                {
                    get: {
                        method: 'GET',
                        params: {
                            '$select': fieldsToSelect,
                            '$expand': fieldsToExpand
                        },
                        headers: {
                            'Accept': 'application/json;odata=verbose;'
                        }
                    },
                    post: {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json;odata=verbose',
                            'Content-Type': 'application/json;odata=verbose;',
                            'X-RequestDigest': spContext.securityValidation
                        }
                    }
                });
        }

        function getDataContextForResource(item) {
            return $resource(_spPageContextInfo.webServerRelativeUrl + "/_api/web/lists/getbytitle('RFI')/items(:itemId)",
                { itemId: item.Id },
                {
                    get: {
                        method: 'GET',
                        params: {
                            '$select': 'Id,Title,Comments,Created,Modified'
                        },
                        headers: {
                            'Accept': 'application/json;odata=verbose;'
                        }
                    },
                    post: {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json;odata=verbose;',
                            'Content-Type': 'application/json;odata=verbose;',
                            'X-RequestDigest': spContext.securityValidation,
                            'X-HTTP-Method': 'MERGE',
                            'If-Match': item.__metadata.etag
                        }
                    },
                    delete: {
                        method: 'DELETE',
                        headers: {
                            'Accept': 'application/json;odata=verbose;',
                            'Content-Type': 'application/json;odata=verbose;',
                            'X-RequestDigest': spContext.securityValidation,
                            'If-Match': '*'
                        }
                    }
                });
        }

        function getAll() {
            var dfd = $q.defer();
            getDataContextForCollection().get({},
                function (data) {
                    dfd.resolve(data.d.results);
                },
                function (error) {
                    dfd.reject(error);
                });
            return dfd.promise;
        }

        function save(rfi) {
            console.log('Repository method...');
        }

        return service;
    }

    spContext.$inject = ['$resource', '$timeout', 'logger'];
    function spContext($resource, $timeout, logger) {
        var service = this;

        service.SP2013REST = {
            selectForCommonFields: 'Id,Title,Created,Modified,AuthorId,EditorId,Attachments,Author/Title,Editor/Title',
            expandoForCommonFields: 'Author,Editor'
        }

        init();

        function init() {
            refreshSecurityValidation();
        }

        function refreshSecurityValidation() {
            if (service.securityValidation) {
                logger.info("refreshing soon-to-expire security validation: " + service.securityValidation);
            }

            var siteContextInfoResource = $resource(_spPageContextInfo.webServerRelativeUrl + '/_api/contextinfo?$select=FormDigestValue', {}, {
                post: {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json;odata=verbose;',
                        'Content-Type': 'application/json;odata=verbose;'
                    }
                }
            });

            // request validation
            siteContextInfoResource.post({}, success, fail);

            function success(data) {
                // obtain security digest timeout & value & store in service
                var validationRefreshTimeout = data.d.GetContextWebInformation.FormDigestTimeoutSeconds - 10;
                service.securityValidation = data.d.GetContextWebInformation.FormDigestValue;
                logger.info("refreshed security validation: " + service.securityValidation);
                logger.info("next refresh of security validation: " + validationRefreshTimeout + " seconds");

                // repeat this in FormDigestTimeoutSeconds-10
                $timeout(
                    function () {
                        refreshSecurityValidation();
                    },
                    validationRefreshTimeout * 1000);
            }

            function fail(error) {
                logger.logError("response from contextinfo: " + error);
            }

        }
    }


})();

(function () {
    'use strict';

    angular
        .module('app.core')
        .run(registerRfiRoute)
        .controller('RfiController', RfiController);

    registerRfiRoute.$inject = ['config', 'routerHelper'];
    function registerRfiRoute(config, routerHelper) {
        routerHelper.configureStates(getStates());

        function getStates() {
            return [
                {
                    state: 'rfi',
                    config: {
                        url: '/rfi',
                        templateUrl: config.baseUrl + '/rfi.html',
                        controller: 'RfiController',
                        controllerAs: 'vm',
                        title: 'RFI'
                    }
                }
            ];
        }
    }

    RfiController.$inject = ['_', 'logger', 'RFI', 'RfiRepository'];
    function RfiController(_, logger, RFI, RFIRepository) {
        var vm = this;
        vm.eventSources = [];

        activate();

        function activate() {
            initTabs();
            fetchData().then(function () {
                logger.info('Activated RFI View');
            });
        }

        function initTabs() {
            vm.tabConfig = {
                selectedSize: "large",
                selectedType: "tabs",
                pivots: [
                    { title: "Open" },
                    { title: "Closed" },
                    { title: "My RFIs" },
                    { title: "Manage RFIs" }
                ],
                selectedPivot: { title: "Open" },
                menuOpened: false
            }
            vm.openMenu = function () {
                vm.tabConfig.menuOpened = !vm.tabConfig.menuOpened;
            }
        }

        function fetchData() {
            return RFIRepository.getAll()
                .then(function (data) {
                    vm.rfiList = _.map(data, function (item) { return new RFI(item); })
                    _.each(vm.rfiList, function (item) {
                        console.log(item);
                        item.complete();
                    });
                })
        }

    }

})();

(function () {
    'use strict';
    //nicer looking plugin found here but requires bootstrap: http://www.dijit.fr/demo/angular-weekly-scheduler/
    angular
        .module('app.core')
        .run(registerMissionTrackerRoute)
        .controller('MissionTrackerController', MissionTrackerController);

    registerMissionTrackerRoute.$inject = ['config', 'routerHelper'];
    function registerMissionTrackerRoute(config, routerHelper) {
        routerHelper.configureStates(getStates());

        function getStates() {
            return [
                {
                    state: 'missionTracker',
                    config: {
                        url: '/missionTracker',
                        templateUrl: config.baseUrl + '/missionTracker.html',
                        controller: 'MissionTrackerController',
                        controllerAs: 'vm',
                        title: 'Mission Tracker'
                    }
                }
            ];
        }
    }

    MissionTrackerController.$inject = ['$q', '_', 'logger'];
    function MissionTrackerController($q, _, logger) {
        var vm = this;

        activate();

        function activate() {
            initTabs();
            $q.all([
                    getDataForMissionTimeline(),
                    getDataForVerticalTimeline(),
                    getDataForProcess()
                ])
                .then(function (data) {
                    vm.missionItems = data[0];
                    vm.missionLifecycleEvents = data[1];
                    vm.routingSteps = data[2];
                    logger.info('Activated Mission Tacker View');
                });
        }

        function initTabs() {
            vm.tabConfig = {
                selectedSize: "large",
                selectedType: "tabs",
                pivots: [
                    { title: "Timeline" },
                    { title: "Products" },
                    { title: "Product Chop" }
                ],
                selectedPivot: { title: "Timeline" },
                menuOpened: false
            }
            vm.openMenu = function () {
                vm.tabConfig.menuOpened = !vm.tabConfig.menuOpened;
            }
        }

        
        function getDataForVerticalTimeline(){
            var staticData = [
                {
                    direction: 'right',
                    subject: 'Born on this date',
                    message: 'Lodash makes JavaScript easier by taking the hassle out of working with arrays, numbers, objects, strings, etc. Lodash’s modular methods are great',
                    moment: moment()
                },
                {
                    direction: 'left',
                    subject: 'Got footprint',
                    message: 'When choosing a motion for side panels, consider the origin of the triggering element. Use the motion to create a link between the action and the resulting UI.',
                    moment: moment().add(1, 'days')
                }       
            ];
            return $q.when(staticData);
        }

        function getDataForProcess(){
            var staticData = [
                {
                    status: 'complete',
                    text: "Shift Created"
                },
                {
                    status: 'complete',
                    text: "Email Sent"
                },
                {
                    status: 'incomplete',
                    text: "SIC Approval"
                },
                {
                    status: '',
                    text: "Shift Completed"
                }
            ];
            return $q.when(staticData);
        }

        function getDataForMissionTimeline(){
            var staticData = [
                {
                    Id: 3,
                    Identifier: "SOTG10_003_KS",
                    Status: 'COA Approved',
                    ExpectedExecution: "2016-08-01T07:00:00Z",
                    ExpectedTermination: "2016-08-03T07:00:00Z",
                    Organization: 'SOTG 10',
                    ParticipatingOrganizations: {
                        results: [
                            'SOAC', 'SOTG 20'
                        ]
                    },
                    ObjectiveName: "OBJ_HAN",
                    ApprovalAuthority: "2B: SOCC NRF",
                    OperationName: "OP_SOLO",
                },
                {
                    Id: 8,
                    Identifier: "SOTG10_004_DA",
                    Status: 'Mission Closed',
                    ExpectedExecution: "2016-08-02T07:00:00Z",
                    ExpectedTermination: "2016-08-08T07:00:00Z",
                    Organization: 'SOTG 10',
                    ParticipatingOrganizations: {
                        results: [
                            'SOTG 20', 'SOTG 30'
                        ]
                    },
                    ObjectiveName: "OBJ_DARTH",
                    ApprovalAuthority: "3A: NRF SOCC",
                    OperationName: "OP_VADER",
                }
            ];
            return $q.when(staticData);
        }



    }

})();

(function () {
    'use strict';

    angular
        .module('app.core')
        .run(registerEditNavRoute)
        .controller('EditNavController', EditNavController);

    registerEditNavRoute.$inject = ['config', 'routerHelper'];
    function registerEditNavRoute(config, routerHelper) {
        routerHelper.configureStates(getStates());

        function getStates() {
            return [
                {
                    state: 'editNav',
                    config: {
                        url: '/editNav',
                        templateUrl: config.baseUrl + '/editnav.html',
                        controller: 'EditNavController',
                        controllerAs: 'vm',
                        title: 'Edit Navigation'
                    }
                }
            ];
        }
    }

    EditNavController.$inject = ['$q', '$timeout', '_', 'logger'];
    function EditNavController($q, $timeout, _, logger) {
        var vm = this;

        var newId = 1;
        vm.ignoreChanges = false;
        vm.newNode = {};
        vm.originalData = [
            { id: 'ajson1', parent: '#', text: 'Simple root node', state: { opened: true } },
            { id: 'ajson2', parent: '#', text: 'Root node 2', state: { opened: true } },
            { id: 'ajson3', parent: 'ajson2', text: 'Child 1', state: { opened: true } },
            { id: 'ajson4', parent: 'ajson2', text: 'Child 2', state: { opened: true } }
        ];
        vm.treeData = [];
        angular.copy(vm.originalData, vm.treeData);
        vm.treeConfig = {
            core: {
                multiple: false,
                animation: true,
                error: function (error) {
                    $log.error('treeCtrl: error from js tree - ' + angular.toJson(error));
                },
                check_callback: true,
                worker: true
            },
            types: {
                default: {
                    icon: 'glyphicon glyphicon-flash'
                },
                star: {
                    icon: 'glyphicon glyphicon-star'
                },
                cloud: {
                    icon: 'glyphicon glyphicon-cloud'
                }
            },
            version: 1,
            plugins: ['dnd', 'contextmenu']
        };


        vm.reCreateTree = function () {
            vm.ignoreChanges = true;
            angular.copy(this.originalData, this.treeData);
            vm.treeConfig.version++;
        };

        vm.simulateAsyncData = function () {
            vm.promise = $timeout(function () {
                vm.treeData.push({ id: (newId++).toString(), parent: vm.treeData[0].id, text: 'Async Loaded' })
            }, 3000);
        };

        vm.addNewNode = function () {
            vm.treeData.push({ id: (newId++).toString(), parent: vm.newNode.parent, text: vm.newNode.text });
        };

        this.setNodeType = function () {
            var item = _.findWhere(this.treeData, { id: this.selectedNode });
            item.type = this.newType;
            console.log('Changed the type of node ' + this.selectedNode);
        };

        this.readyCB = function () {
            $timeout(function () {
                vm.ignoreChanges = false;
                console.log('Js Tree issued the ready event');
            });
        };

        this.createCB = function (e, item) {
            $timeout(function () { console.log('Added new node with the text ' + item.node.text) });
        };

        this.applyModelChanges = function () {
            return !vm.ignoreChanges;
        };

        activate();

        function activate() {
            fetchData()
                .then(function (data) {
                    logger.info('Activated Edit Nav View');
                });
        }

        function fetchData() {
            var staticData = [];
            return $q.when(staticData);
        }

    }

})();

(function () {
    angular
        .module('app.core')
        .directive('missionTimeline', missionTimeline);

    function missionTimeline() {
        /* 
        USAGE: <timeline></timeline>
        */
        var directiveDefinition = {
            link: link,
            restrict: 'E',
            scope: {
                items: "="
            }
        };
        return directiveDefinition;

        function link(scope, elem, attrs) {
            var options = {
                stack: false,
                start: new Date(),
                end: new Date(1000 * 60 * 60 * 24 + (new Date()).valueOf()),
                editable: false,
                margin: {
                    item: 10, // minimal margin between items
                    axis: 5   // minimal margin between items and the axis
                },
                orientation: 'top'
            };

            scope.$watch('items', function () {
                renderTimeline(scope.items);
                console.log('directive received data: ', scope.items);
            })

            function renderTimeline(missions) {
                var groups = new vis.DataSet(_.map(missions, function (item) { return { id: item.Id, content: item.Identifier }; }));
                var items = new vis.DataSet(
                    _.map(missions, function (item) {
                        return {
                            id: item.Id,
                            group: item.Id,
                            start: new Date(item.ExpectedExecution),
                            end: new Date(item.ExpectedTermination)
                        };
                    })
                );


                var timeline = new vis.Timeline(elem[0], null, options);
                timeline.setGroups(groups);
                timeline.setItems(items);
            }


        }
    }

})();

(function () {
    angular
        .module('app.core')
        .directive('verticalTimeline', verticalTimeline);

    function verticalTimeline() {
        /* 
        USAGE: <vertical-timeline items=""></vertical-timeline>
        */
        var directiveDefinition = {
            restrict: 'E',
            scope: {
                items: "="
            },
            template: 
                '<ul class="vertical-timeline">\
                    <li ng-repeat="item in items | orderBy: \'moment\': \'desc\'">\
                        <div ng-class="(item.direction === \'right\' ? \'direction-r\' : \'direction-l\' )">\
                            <div class="flag-wrapper">\
                                <span class="flag">{{item.subject}}</span>\
                                <span class="time-wrapper"><span class="time">{{item.moment.format("DD MMM YY")}}</span></span>\
                            </div>\
                            <div class="desc">{{item.message}}</div>\
                        </div>\
                    </li>\
                </ul>'
        };
        return directiveDefinition;
    }

})();

(function () {
    angular
        .module('app.core')
        .directive('routingProcessVisualization', routingProcessVisualization);

    function routingProcessVisualization() {
        /* 
        USAGE: <routing-process-visualization steps=""></routing-process-visualization>
        */
        var directiveDefinition = {
            restrict: 'E',
            scope: {
                steps: "="
            },
            template: 
                '<ul class="horizontal-timeline">\
                    <li ng-repeat="step in steps" class="li" ng-class="{\'complete\': step.status===\'complete\', \'incomplete\': step.status===\'incomplete\' }">\
                        <div class="status">\
                            <h4>\
                                {{step.text}}\
                            </h4>\
                        </div>\
                    </li>\
                </ul>'
        };
        return directiveDefinition;
    }

})();

(function () {

    angular
        .module('app.core')
        .directive('scrollableCurrentOpsSummary', scrollableCurrentOpsSummary);

        scrollableCurrentOpsSummary.$inject = ['$timeout', 'config'];
        function scrollableCurrentOpsSummary($timeout, config) {
      
	        function controller() {
                var vm = this;
				var slideNames = ['alpha', 'bravo', 'charlie', 'delta'];
				vm.currentVisibleSlide = 'alpha';				

			
				vm.nextSlide = function(){
					var indexOfCurrentSlide = _.indexOf(slideNames, vm.currentVisibleSlide);
					var indexForNextSlide = (indexOfCurrentSlide === slideNames.length-1) ? 0 :  indexOfCurrentSlide+1;
					vm.currentVisibleSlide = slideNames[indexForNextSlide];
					console.log('next slide clicked ' + new Date());
				};
				
				
				vm.prevSlide = function(){
					var indexOfCurrentSlide = _.indexOf(slideNames, vm.currentVisibleSlide);
					var indexForNextSlide = (indexOfCurrentSlide === 0) ? slideNames.length-1 :  indexOfCurrentSlide-1;
					vm.currentVisibleSlide = slideNames[indexForNextSlide];
				};
				
				
				vm.slideShowTimer = null;
				
				function startSlideShowTimer(){
					vm.slideShowTimer = $timeout(
						function(){
							vm.nextSlide();
							vm.slideShowTimer = $timeout(startSlideShowTimer, 2000);
						},
						2000);
				};
				
				startSlideShowTimer();
				
				vm.startShow = function(){
					startSlideShowTimer();				
				};
				
				vm.stopShow = function(){
					$timeout.cancel(vm.slideShowTimer);	
					vm.slideShowTimer = null;			
				};    
		    };    
		       
            return {
                restrict: 'EA', //Default for 1.3+
                scope: {
                    datasource: '=',
                    add: '&',
                },
                controller: controller,
                controllerAs: 'vm',
                bindToController: true, //required in 1.3+ with controllerAs
                templateUrl: config.baseUrl + '/current-operations-summary.html'
            };
        }
})();