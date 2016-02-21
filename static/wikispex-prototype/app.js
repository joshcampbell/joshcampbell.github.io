// UI scripting for Wikispex.
var app = {};
app.searchMode = "0"; // 0 = article, 1 = talk, 2 = user
app.searchModeString = function(){
	if(app.searchMode == "0") return "article";
	if(app.searchMode == "2") return "user";
	else return "error";
}
// ===== GRAPH TYPE DEFINITIONS =====
app.graphs = {};
// setup article history graphs
app.graphs.lineDefaults = {
	xaxes:[{axisLabel:"Time"}],
	xaxis:{mode:"time"},
	lines:{show:true},
	points:{show:true},
	selection: {mode: "xy"},
	grid:{hoverable:true, clickable:true},
	pan:{interactive:true},
	highlightcolor:"#ff0000"
};
app.graphs.line = function(div, data, ylabel){
	// Renders & returns a reference to a zoomable flot line graph.
	var zoomStack = []
	var defaultOptions = $.extend(true, {}, app.graphs.lineDefaults);
	defaultOptions.yaxes = [{axisLabel:ylabel}];
	var options = defaultOptions;
	var series = [data];
	var redraw = function(){
		div[0].plot = $.plot(div, series, options)
	}
	div.off();
	div.bind('plotselected',function (event, ranges){
		zoomStack.push(options);
		options = $.extend(true, {}, defaultOptions, {
			xaxis:{min:ranges.xaxis.from, max:ranges.xaxis.to},
			yaxis:{min:ranges.yaxis.from, max:ranges.yaxis.to}
		})
		redraw();
	});
	div.bind('dblclick', function(){
		if(zoomStack.length > 0){
			options = zoomStack.pop();
			redraw();
		}
	});
	$(window).resize(redraw);
	redraw();
	return {
		div:div,
		data:data,
		series:series,
		options:options,
		zoomStack:zoomStack,
		redraw:redraw
	}
};

$(function(){
// ----- Initialize Wikispex -----
wiki.setUrl("http://en.wikipedia.org/w/api.php");
// ===== UI ELEMENTS =====
// ----- Twitter bootstrap navbar -----
$('#navbar').affix();
$('#navbar a').append('<i class="icon-chevron-right"></i>');
$('#navbar a.up').prepend('<i class="icon-fullscreen"></i> ');
// ----- Content Switcher -----
app.switchContent = function(id){
	// hides all of the divs under #content except the one specified
	$("#content > *").hide();
	$("#content > #"+id).show();
}
// ----- SEARCH FIELD -----
// Toggle between icon-file and icon-user; set global state.
$("#btn-search-articles").click(function(){
	$("#icon-search-mode").attr('class','icon-file');
	app.searchMode = "0";
});
$("#btn-search-users").click(function(){
	$("#icon-search-mode").attr('class','icon-user');
	app.searchMode = "2";
});
// ----- Typeahead / Autocomplete / Opensearch -----
$('#searchbar').typeahead({source:function(query, process){
	if(app.searchMode == 0)
		return wiki.autocomplete(query, function(data){process(data);}, app.searchMode);
	return false;
}});
var doSearch = function(event){
	app.router.navigate("#"+app.searchModeString()+"/"+$('#searchbar').val(), {trigger:true});
	event.stopPropagation();
	event.preventDefault();
};
$('#nav-form').submit(doSearch);
$('#searchbar').change(doSearch);
// ----- Tooltips -----
app.toolTip = function(x,y,contents){
	var css = {
		position:'absolute',
		display:'none',
	};

	if(x > (window.innerWidth / 2)){
		delete css.left;
		css["right"] = window.innerWidth - x;
	} else {
		delete css.right;
		css["left"] = x;
	}
	if(y > (window.innerHeight / 2)){
		delete css.top;
		css["bottom"] = window.innerHeight - y;
	} else {
		delete css.bottom;
		css["top"] = y;
	}
	$('<div id="tooltip">'+contents+"</div>").css(css).appendTo("body").fadeIn(200);
};
app.formatRevisionTooltip = function(revision){
	revision = revision[0];
	var date = new Date(revision.timestamp);
	var retval = "";
	retval += "<p><strong>"+revision.user+"</strong> "
	if(revision.comment)
		retval += ' : "'+revision.comment+'" '
	retval += "</p>"
	if(!isNaN(revision.delta)){
		retval += "<p>"
		if(revision.delta < 0) retval += "- "
		else retval += "+ "
		retval += Math.abs(revision.delta)
		retval += " characters. </p>"
	}
	retval += "<p>@ "+date.toLocaleTimeString()+" on "+date.toLocaleDateString()+"</p>"
	return retval;
};
app.formatContribTooltip = function(contrib){ // user contribs are distinct from page revisions for now
	contrib = contrib[0];
	var retval = "";
	var date = new Date (contrib.timestamp);
	retval += "<p><strong>"+contrib.title+"</strong>";
	if(contrib.comment)
		retval += ': "'+contrib.comment+'"'
	retval += "</p>"
	retval += "<p>@ "+date.toLocaleTimeString()+" on "+date.toLocaleDateString()+"</p>";
	return retval;
};
// ----- Flyout -----
app.flyout = false;
app.sizeFlyout = function(){
	var flyoutStyle = {
		width:window.innerWidth - 30,
		top:60
	}
	$("#flyout").css(flyoutStyle);
}
$(window).resize(app.sizeFlyout);
app.sizeFlyout();
app.showFlyout = function(){
	$("#flyout").animate({right:"0px"});
	app.flyout = true;
}
app.hideFlyout = function(){
	$("#flyout").animate({right:(-1 * (window.innerWidth - 30))});
	app.flyout = false;
}
app.toggleFlyout = function(){
	$("#flyout").show();
	if(!app.flyout){
		app.showFlyout();
	} else {
		app.hideFlyout();
	}
}
$("#flyout-toggle").click(app.toggleFlyout);
// ===== NAVIGATION =====
// ----- Define History Routes -----

var AppRouter = Backbone.Router.extend({
	routes:{
		"article/:title":"article",
		"user/:name":"user",
		"home":"home"
	}
});
app.router = new AppRouter();
app.router.on("route:article", 
	function(title){
		console.log("navigating");
		wiki.article({title:title});
	}
);
app.router.on("route:user", 
	function(name){
		wiki.user({name:name});
	}
);
app.router.on("route:home",
	function(){
		app.switchContent("welcome");
	}
)
app.router.on("all", function(){
	app.hideFlyout();
	$("#flyout").hide();
})

// ===== WIKI.JS EVENT HANDLERS =====
// ----- Articles -----
wiki.on("loaded:article", function(article){
	app.switchContent("article-history");
	$(".article-title").html(article.title);
	$(".article-editorcount").html(_.keys(article.authors).length)
	var points = _.map(article.revisions, function(revision){
		return [revision.timestamp, revision.size];
	});
	var chart = app.graphs.line($("#sizeChart"),points, "Size (bytes)");
	// Draw the tooltip when the user hovers over a datapoint
	chart.div.bind("plothover", function (event, pos, item){
		if(item){
			if(previousPoint != item.dataIndex){
				previousPoint = item.dataIndex;
				$("#tooltip").remove();
				var x = item.pageX;
				var y = item.pageY;
				app.toolTip(x,y,app.formatRevisionTooltip(
					_.where(article.revisions, {timestamp:item.datapoint[0]}))
				);
			}
		} else {
			$("#tooltip").remove();
			previousPoint = null;
		}
	});
	// Request revision details when the user clicks a datapoint
	chart.div.bind("plotclick", function (event, pos, item){
		var rev = _.where(article.revisions, {timestamp:item.datapoint[0]})[0];
		if(item){
			wiki.revision({
				title:article.title,
				pageid:rev.pageid,
				revid:rev.revid
			})
		}
	});
	// Draw the top authors legend and set up highlighting
	var content = '<ul id="article-history-authors">';
	var sortedAuthors = _.sortBy(_.values(article.authors), "count");
	do{
		var author = sortedAuthors.pop();
		if(!author) break;
		content += "<li><span style='float:left' class='name'><a href='#user/"+author.name+"'>"+author.name+"</a></span>"
		content	+= "<span style='float:right'>"+author.count+"</span></li>"
	}while(author.count > 0);
	content += '</ul>';
	$("#article-history-author-table").html(content);
	$("#article-history-author-table .name").mouseover(function(event){
		name = $(event.target).text();
		plot = chart.div[0].plot;
		_.each(article.editsOf(name), function(revision){
			plot.highlight(plot.getData()[0], 
				_.indexOf(chart.series[0],
					_.find(chart.series[0], 
						function(point){
							return (point[0] == revision.timestamp)
						}
					)
				)
			)
		})
	});
	$("#article-history-author-table .name").mouseout(function(event){
		plot = chart.div[0].plot;
		plot.unhighlight();
	})
}); // ----- end of loaded: article -----

// ----- Revisions -----
wiki.on("loaded:revision", function(revision){
	console.dir(revision);
	$("#diffholder").html(wiky.process(revision.diff["*"]));
	var revtext = "<p>Revision by <a href='#user/"+revision.user+"'>"+revision.user+"</a> at "+new Date(revision.timestamp).toLocaleTimeString()+" on "+new Date(revision.timestamp).toLocaleDateString();
	revtext += "  [<a href='http://en.wikipedia.org/w/index.php?oldid="+revision.revid+"'>View on the Wiki</a>]</p>"
	if(revision.comment){
		revtext += '<p><strong>"'+revision.comment+'"</strong></p>';
	}
	$("#revisionInfo").html(revtext)
	app.toggleFlyout();
});

// ----- Users -----
wiki.on("loaded:user", function(user){
	console.log("loaded user");
	console.dir(user);
	app.switchContent("user-history");
	var points = _.map(user.contribs, function(revision){
		return [revision.timestamp, revision.editsToDate];
	});
	var chart = app.graphs.line($("#user-history-chart"),points, "Edit Count");
	// Set up the tooltip
	chart.div.bind("plothover", function (event, pos, item){
		if(item){
			if(previousPoint != item.dataIndex){
				previousPoint = item.dataIndex;
				$("#tooltip").remove();
				var x = item.pageX;
				var y = item.pageY;
				app.toolTip(x,y, app.formatContribTooltip(
					_.where(user.contribs, {timestamp:item.datapoint[0]}))
				);
			}
		} else {
			$("#tooltip").remove();
			previousPoint = null;
		}
	});
	// Set up revision retrieval
	chart.div.bind("plotclick", function (event, pos, item){
	var rev = _.where(user.contribs, {timestamp:item.datapoint[0]})[0];
	if(item){
		wiki.revision({
			title:rev.title,
			pageid:rev.pageid,
			revid:rev.revid
		})
	}
	});
	// Set up the page list legend
	var content = '<ul id="article-history-authors">';
	var sortedPages = _.sortBy(_.values(user.pages), "count");
	do{
		var page = sortedPages.pop();
		if(!page) break;
		content += "<li><span style='float:left' class='name'><a href='#article/"+page.title+"'>"+page.title+"</a></span>"
		content	+= "<span style='float:right'>"+page.count+"</span></li>"
	}while(page.count);
	content += '</ul>';
	$("#user-history-page-table").html(content);
	$("#user-history-page-table .name").mouseover(function(event){
		name = $(event.target).text();
		plot = chart.div[0].plot;
		_.each(_.where(user.contribs, {title:name}), function(contrib){
			plot.highlight(plot.getData()[0], 
				_.indexOf(chart.series[0],
					_.find(chart.series[0], 
						function(point){
							return (point[0] == contrib.timestamp)
						}
					)
				)
			)
		})
	});
	$("#user-history-page-table .name").mouseout(function(event){
		plot = chart.div[0].plot;
		plot.unhighlight();
	})	
});
// ----- Loading -----
wiki.on("loading", function(){
	app.switchContent("loading");
});
Backbone.history.start();
}) // (end init function)
