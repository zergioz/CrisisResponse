﻿(function () {
	'use strict';

  	angular.module('SharePoint.common', [])
  		.factory('sharepointUtilities', dataservice)
  		.factory('fieldAttributeValuesValidation', fieldAttributeValuesValidation)
  		.factory('fieldXmlGeneration', fieldXmlGeneration);

	dataservice.$inject = ['$http', '$location', '$q', 'fieldXmlGeneration', 'logger'];
	
	function dataservice($http, $location, $q, fieldXmlGeneration, logger) {
	    //logError(message, data, source, showNotification)
	    return {
	    	createList: createList,
	        getLists: getLists
	    };
	    
	    
	    
	    function createList(opts){
	    	return getDependencies()
	    		.then(_createList);
	    	
	    	function getDependencies(){
	    		var dependentLists = [];
	    		
	    		var containsLookupFields = _.some(opts.fieldsToCreate, function(fieldDef){ return _.contains(["Lookup", "LookupMulti"], fieldDef.Type);});
	    		
	    		if(containsLookupFields){
	    			console.log('extra network call to get dependent lists');
	    			return getLists(opts.webUrl);
	    		} else {
	    			console.log('no dependencies');
	    			return $q.when(dependentLists);
	    		}
	    	}
	    	
	    	function _createList(dependentLists){
	    		var dfd = $q.defer();
				var ctx = new SP.ClientContext(opts.webUrl);
	    		var spWeb = ctx.get_web();
	    		var createdList = null;
	    		var createdFields = [];
	    		
	    		//create list
	    		var listCreationInfo = new SP.ListCreationInformation();
	    		var uglyListName = new Sugar.String(opts.Title).camelize().raw;
				listCreationInfo.set_title(uglyListName);
				listCreationInfo.set_templateType(SP.ListTemplateType[opts.BaseTemplate]);
				createdList = spWeb.get_lists().add(listCreationInfo);
				
				//update list: make the name of list pretty, turn-on versioning if necessary
				createdList.set_title(opts.Title);
				if(opts.enableVersioning){
					createdList.set_enableVersioning(true);
				}
				createdList.update();
				
				//add fields
				_.each(opts.fieldsToCreate, function(fieldDef){
					if(fieldDef.Type === 'Lookup' || fieldDef.Type === 'LookupMulti'){
						//obtain list GUID
						var sourceList = _.findWhere(dependentLists, {name: fieldDef.List})
						if(sourceList){
							fieldDef.List = sourceList.guid;
						}
					}
				
					var xml = fieldXmlGeneration.generate(fieldDef);
					var newField = createdList.get_fields().addFieldAsXml(xml, true, SP.AddFieldOptions.addFieldInternalNameHint);	
					createdFields.push(newField);
				});
				
				//update to Title field (if necessary)
				if(opts.shouldHideTitleField){
					var titleField = createdList.get_fields().getByTitle("Title");
					titleField.setShowInDisplayForm(false);
					titleField.setShowInNewForm(false);
					titleField.setShowInEditForm(false);
					titleField.set_hidden(true);
					titleField.set_required(false);
					titleField.update();	
				}
				
				//update to default view
				var defaultViews = {
	    			documentLibrary: 'All Documents'
	    		};
				var viewName = defaultViews[opts.BaseTemplate] || "All Items";
				var defaultView = createdList.get_views().getByTitle(viewName);
				if(opts.shouldHideTitleField){
					defaultView.get_viewFields().remove("LinkTitle");
				}
				var internalFieldNamesForHiddenFields = _.pluck(_.where(opts.fieldsToCreate, {Hidden: 'TRUE'}), "Name"); 
				_.each(internalFieldNamesForHiddenFields, function(internalFieldName){
					defaultView.get_viewFields().remove(internalFieldName);
				});
				defaultView.update();				
			
				//batch, setup, and send the request
				ctx.load(createdList);
				_.each(createdFields, function(createdField){
					ctx.load(createdField);
				});
				ctx.executeQueryAsync(
			        Function.createDelegate(this, onQuerySucceeded), 
			        Function.createDelegate(this, onQueryFailed)
			    );
			    
			    return dfd.promise;
			    
			    function onQuerySucceeded(){
			    	logger.logSuccess('Created list: ('+opts.Title+')', null, 'sharepointUtilities service, createList()');
			    	dfd.resolve();
			    }
			    function onQueryFailed(sender, args){
			    	logger.logError('Request to create list ('+opts.Title+') failed: ' + args.get_message(), args.get_stackTrace(), 'sharepointUtilities service, createList()');
			    	dfd.reject();
			    }	    	
	    	}
	    }
	    
		function getLists(webUrl){
			var dfd = $q.defer();
			var ctx = new SP.ClientContext(webUrl);
    		var spWeb = ctx.get_web();
    		var listCollection = spWeb.get_lists();

			
   			var queryResult = ctx.loadQuery(listCollection, 'Include(Id,Title,BaseTemplate,Fields.Include(Title,InternalName,TypeDisplayName,Hidden,TypeAsString),Views.Include(Title,Hidden))');
		    ctx.executeQueryAsync(
		        Function.createDelegate(this, onQuerySucceeded), 
		        Function.createDelegate(this, onQueryFailed)
		    );
		    
		    return dfd.promise;
		    
		    function onQuerySucceeded(){
		    	
		    	var lists = [];
		    	for (var i = 0; i < queryResult.length; i++) {
			        var currList = queryResult[i];
			        var list = {guid: currList.get_id().toString(), name: currList.get_title(), baseTemplateType: currList.get_baseTemplate(), fields:[], views:[]}; 
			        
			        //REST EQUIVALENT FOR NON-HIDDEN FIELDS: /_api/web/lists/getbytitle('Documents')/fields?$filter=Hidden eq false
			        var fieldsForCurrentList = currList.get_fields();
			        var fieldEnumerator = fieldsForCurrentList.getEnumerator();   
			        while (fieldEnumerator.moveNext()) {
			            var currentField = fieldEnumerator.get_current();
			            if(!currentField.get_hidden()){
			            	list.fields.push({
			            		displayName: currentField.get_title(), 
			            		internalName: currentField.get_internalName(),
			            		typeForSchemaDefinition: currentField.get_typeAsString(), 
			            		type: currentField.get_typeDisplayName()
			            	});
			            }
			        }
					
					//REST EQUIVALENT FOR NON-HIDDEN VIEWS: /_api/web/lists/getbytitle('Documents')/views?$filter=Hidden eq false
			        var viewsForCurrentList = currList.get_views();
			        var viewsEnumerator = viewsForCurrentList.getEnumerator();   
			        while (viewsEnumerator.moveNext()) {
			            var currentView = viewsEnumerator.get_current();
			            if(!currentView.get_hidden()){
			            	list.views.push({
			            		title: currentView.get_title()			            	
			            	});
			  	          }
			        }
		        
			        
			        lists.push(list);
			    }

		    	dfd.resolve(lists);
		    }
		    function onQueryFailed(sender, args){
		    	logger.logError('Request failed: ' + args.get_message(), args.get_stackTrace(), 'sharepointUtilities service, getLists()');
		    	dfd.reject();
		    }
		}
	}

	fieldAttributeValuesValidation.$inject = ['logger'];
	function fieldAttributeValuesValidation(logger){
		return {
				AppendOnly: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},	
				Decimals: function(val){
					return _.isNumber(val);				
				},
				Description: function(val){
					return _.isString(val);				
				},				
				DisplayName: function(val){
					return _.isString(val);				
				},
				FillInChoice: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},
				Format: function(val){
					return _.isString(val) && _.contains(['DateOnly', 'DateTime', 'Dropdown', 'Hyperlink', 'Image', 'RadioButtons'], val);			
				},
				Hidden: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},
				List: function(val){
					return _.isString(val);				
				},
				Max: function(val){
					return _.isNumber(val);				
				},	
				MaxLength: function(val){
					return _.isNumber(val);				
				},	
				Min: function(val){
					return _.isNumber(val);				
				},
				Mult: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},			
				Name: function(val){
					return _.isString(val);				
				},
				NumLines: function(val){
					return _.isNumber(val);				
				},	
				ReadOnly: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},	
				Required: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},
				ResultType: function(val){
					return _.isString(val);				
				},
				RichText: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},
				ShowField: function(val){
					return _.isString(val);				
				},
				ShowInEditForm: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},
				ShowInNewForm: function(val){
					return _.isString(val) && _.contains(['TRUE', 'FALSE'], val.toUpperCase());			
				},
				Type: function(val){
					return _.isString(val) && _.contains(['Boolean', 'Calculated', 'Choice', 'DateTime', 'Lookup', 'LookupMulti', 'MultiChoice','Note', 'Number', 'Text', 'URL', 'User', 'UserMulti'], val);			
				},
				UserSelectionMode: function(val){
					return _.isString(val) && _.contains(['PeopleAndGroups', 'PeopleOnly'], val);			
				}		
			};
	}
	
	
				
	
	fieldXmlGeneration.$inject = ['fieldAttributeValuesValidation', 'logger'];
	function fieldXmlGeneration(fieldAttributeValuesValidation, logger){
		var svc = {
			generate: generate		
		};
		return svc;
		
		
		
		function generate(mapping){
			if( !mapping.Type || !mapping.Name || !mapping.DisplayName){
				logger.logWarning("Type, Name and Display Name are always required anytime you create a SharePoint field");
				return "";			
			}
			
			var funcs = {
				"Boolean": generateCamlForBooleanField,
				"Calculated": generateCamlForCalculatedField,
				"Choice": generateCamlForChoiceField,
				"DateTime": generateCamlForDateTimeField,
				"Lookup": generateCamlForLookupField,
				"LookupMulti": generateCamlForLookupMultiField,
				"MultiChoice": generateCamlForMultiChoiceField,		
				"Note": generateCamlForNoteField,
				"Number": generateCamlForNumberField,
				"Text": generateCamlForTextField,
				"URL": generateCamlForUrlField,
				"User": generateCamlForUserField,
				"UserMulti": generateCamlForUserMultiField		
			};	
						
			return funcs[mapping.Type](mapping);				
		}
		
		
				
		function generateCaml(mapping, supportedAttrs){
			var validSettings = {};
			var choicesCaml = "";
			var defaultCaml = "";
			var formulaCaml = "";
			var fieldRefsCaml = "";
						
			_.each(supportedAttrs, function(attr){
				var attrVal = mapping[attr];
				
				if(attrVal === 0 || !!attrVal){
					if(attr === "Default"){
						defaultCaml = "<Default>" + attrVal + '</Default>';				
					} else if(attr === "Formula"){
						formulaCaml = "<Formula>" + attrVal + '</Formula>';	
					} else if(attr === "Choices" && _.isArray(attrVal)){
						choicesCaml = _.map(attrVal, function(option){
							return "<CHOICE>" + option + "</CHOICE>";				
						})
						.join('');
						choicesCaml = "<CHOICES>" + choicesCaml + "</CHOICES>";
					} else if(attr === "FieldRefs" && _.isArray(attrVal)){
						fieldRefsCaml = _.map(attrVal, function(internalFieldName){
							return  "<FieldRef Name='" + internalFieldName +"' />";				
						})
						.join('');
						fieldRefsCaml = "<FieldRefs>" + fieldRefsCaml + "</FieldRefs>";
					} else{
						if( fieldAttributeValuesValidation[attr] && fieldAttributeValuesValidation[attr](attrVal)){				
							validSettings[attr] = attrVal;				
						}
					}
				}
			});
			
			if(!validSettings["StaticName"]){
				validSettings["StaticName"] = validSettings["Name"]	
			}
			
			var strAttrs = '';
			
			 _.each(validSettings, function(val, attr){
				strAttrs += ' ' + attr + "='" + val + "'"; 			
			});			
			
			return [
				'<Field',
				strAttrs,
				'>',
				defaultCaml,
				choicesCaml,
				formulaCaml,
				fieldRefsCaml,
				'</Field>'
				].join('');	
				
				
		}
			
		function generateCamlForBooleanField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Default", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];
			return generateCaml(mapping, supported);		
		}
		
		function generateCamlForCalculatedField(mapping){
   			var supported = ["Name", "DisplayName", "Type", "Required", "ResultType", "ReadOnly", "Formula", "FieldRefs", "Description"];			
			return generateCaml(mapping, supported);
		}
		
		function generateCamlForDateTimeField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Required", "Format", "Default", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];			
			return generateCaml(mapping, supported);
		}		
		
		function generateCamlForChoiceField(mapping){			
			var supported = ["Name", "DisplayName", "Type", "Format", "Required", "Choices", "FillInChoice", "Default", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];			
			return generateCaml(mapping, supported);
		}
		
		function generateCamlForLookupField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Required", "List", "ShowField", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];			
			return generateCaml(mapping, supported);
		}	
		
		function generateCamlForLookupMultiField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Required", "List", "ShowField", "Mult", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];			
			return generateCaml(mapping, supported);
		}		
	
		function generateCamlForMultiChoiceField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Format", "Required", "Choices", "FillInChoice", "Default", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];	
			return generateCaml(mapping, supported);		
		}	
		
		function generateCamlForNoteField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Required", "NumLines", "RichText", "AppendOnly", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];
			return generateCaml(mapping, supported);		
		}	
		
		function generateCamlForNumberField(mapping){			
			var supported = ["Name", "DisplayName", "Type", "Required", "Decimals", "Min", "Max", "Default", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];			
			return generateCaml(mapping, supported);

		}	
		
		function generateCamlForTextField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Required", "MaxLength", "Default", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];
			return generateCaml(mapping, supported);		
		}
		
		function generateCamlForUrlField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Required", "Format", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];			
			return generateCaml(mapping, supported);
		}		

		function generateCamlForUserField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Required", "UserSelectionMode", "ShowField", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];			
			return generateCaml(mapping, supported);
		}		
	
		function generateCamlForUserMultiField(mapping){
			var supported = ["Name", "DisplayName", "Type", "Required", "UserSelectionMode", "ShowField", "Mult", "Description", "ShowInNewForm", "ShowInEditForm", "Hidden"];			
			return generateCaml(mapping, supported);
		}	
				
	}


})();



