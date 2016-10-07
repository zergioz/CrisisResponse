/**
 * TODO: read before overriding fields for EditForm:
 * http://sharepoint.stackexchange.com/questions/112506/sharepoint-2013-js-link-return-default-field-rendering
 * 
 * POSSIBLE ISSUES with Minimal Download Strategy, should we be register templates differently....
 * https://blogs.msdn.microsoft.com/sridhara/2013/02/08/register-csr-override-on-mds-enabled-sharepoint-2013-site/
 */
(function () {
    var fieldCustomizations = {};

    /* ActionsHtml COLUMN*/
    fieldCustomizations["ActionsHtml"] = {};
    fieldCustomizations["ActionsHtml"]["View"] = function (ctx) {
        try {
            var html;
            if (ctx.ListTitle === "RFI") {
                var buttonText = (ctx.CurrentItem.Status === "Open") ? "Respond" : "Reopen";
                html = "<a class='custombtn' rfibutton data-id='" + ctx.CurrentItem.ID + "'>" + buttonText + "</a>";
            }
            return STSHtmlDecode(html);
        }
        catch (err) {
            return 'Error parsing calculated column "ActionsHtml"';
        }
    };

    /* ChopProcess COLUMN*/
    fieldCustomizations["ChopProcess"] = {};
    fieldCustomizations["ChopProcess"]["View"] = function (ctx) {
        try {
            var html;
            if (ctx.ListTitle === "Mission Documents") {
                if(!ctx.CurrentItem.ChopProcess){
                    html = "<a class='custombtn' initiatechopbutton data-id='" + ctx.CurrentItem.ID + "'>Chop</a>";
                } else {
                    var onHoverText = "Process was initiated on " + ctx.CurrentItem.ChopProcess;
                    html = "<a class='disabled-custombtn' title='"+onHoverText+"'>Chop</a>";
                }
            }
            return STSHtmlDecode(html);
        }
        catch (err) {
            return 'Error parsing column "ChopProcess"';
        }
    };

    // Register the rendering template
    SPClientTemplates.TemplateManager.RegisterTemplateOverrides({
        Templates: {
            Fields: {
                'ActionsHtml': { 'View': fieldCustomizations["ActionsHtml"]["View"] },
                'ChopProcess': { 'View': fieldCustomizations["ChopProcess"]["View"] }
            },
            OnPostRender: function(ctx){
                
                var webPartDiv = getWebPartDiv(ctx); 

                addExpandCollapseButtons(ctx, webPartDiv);
                disableNavigationToSharepointLists(ctx, webPartDiv);

                function addExpandCollapseButtons(ctx, webPartDiv){
                    /**
                     * ISSUES with LVWP that Group By Collapsed=TRUE are well documented:
                     * https://social.technet.microsoft.com/Forums/en-US/cf86ffbc-14e9-4310-8925-76bea6d9e314/sharepoint-list-when-grouped-and-default-view-is-collapsed-will-not-expand?forum=sharepointgeneralprevious
                     * https://prasadpathak.wordpress.com/2014/07/10/sharepoint-2013-item-template-not-called-in-jslink-with-group-rendering/
                     * https://ybbest.wordpress.com/2011/07/05/fix-the-ajax-javascript-issues-with-group-by-for-listview-and-listviewbyquery/
                     */
                    var isGroupByView = !!ctx.ListSchema.group1;
                    if(isGroupByView){
                        addButton('Expand All');
                        addButton('Collapse All');
                    }

                    function addButton(text){
                        var chromeTitle = webPartDiv.find(".ms-webpart-titleText");
                        var faClass, clickFunc;
                        if(text === "Expand All"){
                            faClass = 'fa-plus-square-o';
                            clickFunc = expandAll;    
                        } else if(text === "Collapse All"){
                            faClass = 'fa-minus-square-o';
                            clickFunc = collapseAll;
                        }
                        if(chromeTitle.find("a[title='"+text+"']").size() === 0){
                            var button = $('<a style="cursor:pointer;margin-left:3px;" title="'+text+'"><i class="fa '+faClass+'" aria-hidden="true"></i></a>');
                            chromeTitle.append(button);
                            button.on('click', clickFunc);
                        }
                    }

                    function collapseAll(){
                        webPartDiv.find("img.ms-commentcollapse-icon").click();
                    }

                    function expandAll(){
                        webPartDiv.find("img.ms-commentexpand-icon").click();
                    }
                }

                function disableNavigationToSharepointLists(ctx, webPartDiv){
                    var wpPages = [
                        '/sitepages/comms.aspx',
                        '/sitepages/excon.aspx',
                        '/sitepages/soatg.aspx',
                        '/sitepages/socc.aspx',
                        '/sitepages/sotg.aspx'
                    ];
                    var shouldDisableLinks = _.some(wpPages, function(item){
                        return _.includes(document.location.pathname.toLowerCase(), item);
                    });

                    if(shouldDisableLinks){
                         //prevents users from navigating to backend lists
                        webPartDiv.find(".ms-webpart-titleText>a").removeAttr("href");   
                    }
                }
                
                function getWebPartDiv(ctx){
                    /**
                     * Webparts are automatically assigned id attributes, so if eight webparts on the screen:
                     * <div id="MSOZoneCell_WebPartWPQ8"></div>
                     */
                    return $("div[id='MSOZoneCell_WebPart"+ctx.wpq+"']");
                }
            }
        }
    });

    /**
     * WRAP in document ready:
     * Needs to run AFTER all the RegisterSod() invocations that SP2013 master puts near the closing </head> tag
     */
    $(document).ready(registerCustomCalloutCustomizationsForDocumentLibrary);

    function getDefaultHtmlOutput(ctx, field, listItem, listSchema) {
        /**
         * USAGE:
         * var output = getDefaultFieldHtml (ctx, ctx.CurrentFieldSchema, ctx.CurrentItem, ctx.ListSchema);
         */
        var fieldCopy = jQuery.extend(true, {}, field);
        var ctxCopy = jQuery.extend(true, {}, ctx);
        delete fieldCopy.fieldRenderer;
        ctxCopy.Templates.Fields[field.Name] = null;
        var spmgr = new SPMgr();
        var output = spmgr.RenderField(ctxCopy, fieldCopy, listItem, listSchema);
        // do whatever you need to do here
        return output;
    }

    function getDefaultHtmlOutput_v1(ctx, field, listItem, listSchema) {
        //https://threewill.com/client-side-rendering-sharepoint-2013/
        var renderingTemplateToUse = null;

        var fieldRenderMap = {
            Computed: new ComputedFieldRenderer(field.Name),
            Attachments: new AttachmentFieldRenderer(field.Name),
            User: new UserFieldRenderer(field.Name),
            UserMulti: new UserFieldRenderer(field.Name),
            URL: new UrlFieldRenderer(field.Name),
            Note: new NoteFieldRenderer(field.Name),
            Recurrence: new RecurrenceFieldRenderer(field.Name),
            CrossProjectLink: new ProjectLinkFieldRenderer(field.Name),
            AllDayEvent: new AllDayEventFieldRenderer(field.Name),
            Number: new NumberFieldRenderer(field.Name),
            BusinessData: new BusinessDataFieldRenderer(field.Name),
            Currency: new NumberFieldRenderer(field.Name),
            DateTime: new DateTimeFieldRenderer(field.Name),
            Text: new TextFieldRenderer(field.Name),
            Lookup: new LookupFieldRenderer(field.Name),
            LookupMulti: new LookupFieldRenderer(field.Name),
            WorkflowStatus: new RawFieldRenderer(field.Name)
        };

        if (field.XSLRender == '1') {
            renderingTemplateToUse = new RawFieldRenderer(field.Name);
        }
        else {

            renderingTemplateToUse = fieldRenderMap[field.FieldType];
            if (renderingTemplateToUse == null){
                renderingTemplateToUse = fieldRenderMap[field.Type];
            }
        }   

        if (renderingTemplateToUse == null){
            renderingTemplateToUse = new FieldRenderer(field.Name);
        }

        return renderingTemplateToUse.RenderField(ctx, field, listItem, listSchema);
    }

    function registerCustomCalloutCustomizationsForDocumentLibrary() {
        SP.SOD.executeFunc("callout.js", "Callout", function () {
            var customization = {};
            customization.Templates = {};
            customization.BaseViewID = 'Callout';
            // Define the list template type
            customization.ListTemplateType = 101;
            customization.Templates.Footer = function (customization) {
                // context, custom action function, show the ECB menu (boolean)
                return CalloutRenderFooterTemplate(customization, AddCustomAction, true);
            };
            SPClientTemplates.TemplateManager.RegisterTemplateOverrides(customization);
        });

        function AddCustomAction(ctx, calloutActionMenu) {
             var editPropertiesUrl = ctx.editFormUrl + '&ID=' + ctx.CurrentItem.ID + "&Source=" + encodeURIComponent(document.location.href);
            // Add your custom action
            calloutActionMenu.addAction(new CalloutAction({
                text: "Properties",
                tooltip: 'Modify metadata for this document',
                onClickCallback: function() { 
                    document.location.href = editPropertiesUrl;
                }
            }));

            // Show the default document library actions
            CalloutOnPostRenderTemplate(ctx, calloutActionMenu);
        }
    }

})();

