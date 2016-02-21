// wiki.js - Wikispex's abstraction layer for the MediaWiki api.
// It's a work in progress, unsuitable for general use right now.
// DEPENDENCIES
//   jquery >= 1.8.1
//   backbone.js
/* HOW TO USE
	wiki.setUrl() - Pass this the url to the target wiki's copy of api.php.
		You must run this method before making any requests.
		For english wikipedia, use http://en.wikipedia.org/w/api.php
		There are often problems accessing wikis running older versions of the API.
	Initiate requests via function calls:
		wiki.article({title:"Some Title"})
		wiki.user({name:"Some Name"})
		wiki.revision({revid:intValue})
	Access results of requests by subscribing to events:
		wiki.on({"loaded:article"|"loaded:user"|"loaded:revision"}, function(resultObject){})
		(no reference on structure of returned objects yet, just use console.dir for now)
	Other events are also exposed:
		wiki.on("loading", function(message){}) 
		wiki.on("loading:done", function(){})
	Finally, autocomplete is implemented using callbacks for ease of use w/ twitter bootstrap's
	typeahead control.
		wiki.autocomplete("partial phrase", callback, namespaceAsInteger)
			(see http://en.wikipedia.org/wiki/Wikipedia:Namespace)
	
*/
(function(){
	var root = this // probably always going to be 'window'
	wiki = root.wiki = {};
	wiki.maxRevisions = 20000;
	_.extend(wiki, Backbone.Events);
	wiki.buildQuery = function(params){
		var appendix = "";
		_.each(params, function(value, key, list){
			appendix = appendix + "&" + key + "=" + value;
		});
		return "?format=json"+appendix;
	}
	wiki.query = function(params, callback){
		var qurl = wiki.url+wiki.buildQuery(params);
		var results;
		console.log("fetching "+qurl);
		$.ajax({
			url:qurl,
			dataType:'jsonp',
			data:{},
			success:function(data, statusText, jqXHR){
				results = data;
				callback(data);
			},
			error:function(jqXHR, statusText, errorThrown){
				throw new Error("Query failed: "+statusText+" -- "+errorThrown);
			}
		});
	}
	wiki.setUrl = function(url){
		var old_url = wiki.url;
		wiki.url = url;
		try{
			wiki.query({action:"query"}, function(data){
				wiki.trigger("connected", url);
			});
		}
		catch(error){
			wiki.url = old_url;
			throw error;
		}
	}
	wiki.autocomplete = function(partial, callback, namespace){
		callback = typeof callback == 'function' ?  callback : function(){}
		namespace = typeof namespace !== 'undefined' ? namespace : 0;
		wiki.query({action:"opensearch", search:partial, limit:"20", namespace:namespace}, 
			function(data){
				callback(data[1]);
			});
	}
// ===== ARTICLES =====
	wiki.articleMethods = {
		// These get grafted on to the JSON "page" objects returned by the API.
		test:function(){
			return this.pageid;
		},

		generateAuthorList:function(){
			revisions = this.revisions
			authors = this.authors = {};
			this.bytesAdded = 0;
			this.bytesDeleted = 0;
			article = this;
			// first pass - calculate totals
			revisionCount = revisions
			_.each(this.revisions, function(revision, idx, revisions){
				revision.timestamp = Date.parse(revision.timestamp);
				revision.pageid = article.pageid;
				if(!authors[revision.user]){
					authors[revision.user] = {
						name:revision.user, 
						count:0,
						bytesAdded:0,
						bytesDeleted:0,
						timeLast:revision.timestamp 
					}
				}
				prevIdx = idx+1; // (previous index chronologically)
				if(prevIdx < revisions.length)
					revision.delta = revision["size"] - revisions[prevIdx]["size"];
				else {
					revision.delta = revision.size;
				}
				authors[revision.user].count++;
				if(revision.delta > 0){
					authors[revision.user].bytesAdded += revision.delta;
					article.bytesAdded += revision.delta
				}
				if (revision.delta < 0){
					var tmp = revision.delta * -1;
					authors[revision.user].bytesDeleted += tmp;
					article.bytesDeleted += tmp
				}
				authors[revision.user].timeFirst = revision.timestamp;
			});
			// second pass - calculate percentages
			for(key in this.authors){
				var author = this.authors[key];
				author.bytesAddedPct = author.bytesAdded / article.bytesAdded;
				author.bytesDeletedPct = author.bytesDeleted / article.bytesDeleted;
				author.countPct = author.count / revisions.length;
			}
		},
		editsOf:function(user, sort){
			// parameters
			//   user - username to filter by
			//   sort - property to sort ascending by (see authorList)
			sort = typeof sort !== 'undefined' ? sort : "timestamp";
			return _.sortBy(_.where(this.revisions, {user:user}), sort);
		}
	}
	wiki.article = function(args){
		// expected args: 
		// 		"title" - a valid page title
		var page = {};
		wiki.trigger("loading",{message:"Loading article data."})
		wiki.query({titles:args.title, action:"query", prop:"info", inprop:"protection|url"}, function(data){
			for(var pageIdx in data.query.pages){ // dirty hack to find first child (named with a pageID we don't know yet)
				page = data.query.pages[pageIdx];
				page.revisions = [];
				wiki.trigger("loading",{message:"Retrieving article revisions."})
				var queryParams = {titles:args.title, action:"query", prop:"revisions", rvlimit:500, rvprop:"timestamp|user|size|comment|flags|tags|ids"};
				var continueQuery = function(){
					wiki.query(queryParams, function(data){
						if(data.query.pages[page.pageid]){
							page.revisions = _.union(page.revisions, data.query.pages[page.pageid].revisions)
						}
						if(data["query-continue"] && page.revisions.length < wiki.maxRevisions){
							queryParams.rvstartid = data["query-continue"].revisions.rvcontinue
							continueQuery()
						} else {
							_.extend(page, wiki.articleMethods)
							page.generateAuthorList();
							wiki.trigger("loading:done")
							wiki.trigger("loaded:article", page);
						}
					})
				}
				continueQuery(queryParams, page)
			}
		});
	};
// ===== REVISIONS =====
// Distinct from articles, because sometimes we want them in isolation.
// Revision ids are unique across the entire wiki.
	wiki.revision = function(args){
		// expected args: 
		//   "title" - a page title
		//   "pageid" - the corresponding pageid
		//   "revid" - revision identifier
		var params = {action:"query", prop:"revisions",rvprop:"timestamp|user|size|comment|flags|tags|ids|content",titles:args.title,rvstartid:args.revid, rvendid:args.revid, rvdiffto:"prev"}
		wiki.query(params, function(data){
			revision = data.query.pages[args.pageid].revisions[0];
			wiki.trigger("loaded:revision", revision)
		})
	}
// ===== USERS =====
	wiki.userMethods = {
		generatePageList:function(){
			var pages = this.pages = {}
			_.each(this.contribs, function(contrib, idx, contribs){
				if(!pages[contrib.title]){
					pages[contrib.title] = {};
					pages[contrib.title].count = 0;
					pages[contrib.title].title = contrib.title;
				}
				pages[contrib.title].count++;
			});
		}
	}
	wiki.user = function(args){
		// expected args:
		//	"name" - a valid username
		wiki.trigger("loading", {message:"Loading user data."})
		var user = {}
		// --- Get Basic User Data ---
		var params = {action:"query",list:"users",ususers:args.name, usprop:"blockinfo|groups|editcount|registration|emailable|gender"}
		wiki.query(params, function(data){
			user = data.query.users[0];
			// --- Get Contributions ---
			user.contribs = []
			params = {action:"query", list:"usercontribs", ucuser:args.name, uclimit:500};
			var continueQuery = function(){
				wiki.query(params, function(data){
					user.contribs = _.union(user.contribs, data.query["usercontribs"])
					if(data["query-continue"] && user.contribs.length < wiki.maxRevisions){
						params.ucstart = data["query-continue"].usercontribs.ucstart;
						continueQuery();
					} else{
						editsToDate = user.contribs.length;
						user.revisions = user.contribs;
						_.each(user.contribs, function(revision, idx, revisions){
							revision.timestamp = Date.parse(revision.timestamp);
							revision.editsToDate = --editsToDate;
						})
						_.extend(user, wiki.userMethods);
						user.generatePageList();
						wiki.trigger("loading:done")
						wiki.trigger("loaded:user", user)
					}
				})
			}
			continueQuery();
		})
	}
}).call(this);