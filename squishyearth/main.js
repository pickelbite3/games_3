/*
 * Hammer.JS
 * version 0.6.4
 * author: Eight Media
 * https://github.com/EightMedia/hammer.js
 * Licensed under the MIT license.
 */
function Hammer(element, options, undefined)
{
    var self = this;

    var defaults = mergeObject({
        // prevent the default event or not... might be buggy when false
        prevent_default    : false,
        css_hacks          : true,

        swipe              : true,
        swipe_time         : 500,   // ms
        swipe_min_distance : 20,   // pixels

        drag               : true,
        drag_vertical      : true,
        drag_horizontal    : true,
        // minimum distance before the drag event starts
        drag_min_distance  : 20,    // pixels

        // pinch zoom and rotation
        transform          : true,
        scale_treshold     : 0.1,
        rotation_treshold  : 15,    // degrees

        tap                : true,
        tap_double         : true,
        tap_max_interval   : 300,
        tap_max_distance   : 10,
        tap_double_distance: 20,

        hold               : true,
        hold_timeout       : 500,

        allow_touch_and_mouse   : false
    }, Hammer.defaults || {});
    options = mergeObject(defaults, options);

    // some css hacks
    (function() {
        if(!options.css_hacks) {
            return false;
        }

        var vendors = ['webkit','moz','ms','o',''];
        var css_props = {
            "userSelect": "none",
            "touchCallout": "none",
            "touchAction": "none",
            "userDrag": "none",
            "tapHighlightColor": "rgba(0,0,0,0)"
        };

        var prop = '';
        for(var i = 0; i < vendors.length; i++) {
            for(var p in css_props) {
                prop = p;
                if(vendors[i]) {
                    prop = vendors[i] + prop.substring(0, 1).toUpperCase() + prop.substring(1);
                }
                element.style[ prop ] = css_props[p];
            }
        }
    })();

    // holds the distance that has been moved
    var _distance = 0;

    // holds the exact angle that has been moved
    var _angle = 0;

    // holds the direction that has been moved
    var _direction = 0;

    // holds position movement for sliding
    var _pos = { };

    // how many fingers are on the screen
    var _fingers = 0;

    var _first = false;

    var _gesture = null;
    var _prev_gesture = null;

    var _touch_start_time = null;
    var _prev_tap_pos = {x: 0, y: 0};
    var _prev_tap_end_time = null;

    var _hold_timer = null;

    var _offset = {};

    // keep track of the mouse status
    var _mousedown = false;

    var _event_start;
    var _event_move;
    var _event_end;

    var _has_touch = ('ontouchstart' in window);

    var _can_tap = false;


    /**
     * option setter/getter
     * @param   string  key
     * @param   mixed   value
     * @return  mixed   value
     */
    this.option = function(key, val) {
        if(val !== undefined) {
            options[key] = val;
        }

        return options[key];
    };


    /**
     * angle to direction define
     * @param  float    angle
     * @return string   direction
     */
    this.getDirectionFromAngle = function( angle ) {
        var directions = {
            down: angle >= 45 && angle < 135, //90
            left: angle >= 135 || angle <= -135, //180
            up: angle < -45 && angle > -135, //270
            right: angle >= -45 && angle <= 45 //0
        };

        var direction, key;
        for(key in directions){
            if(directions[key]){
                direction = key;
                break;
            }
        }
        return direction;
    };


    /**
     * destroy events
     * @return  void
     */
    this.destroy = function() {
        if(_has_touch || options.allow_touch_and_mouse) {
            removeEvent(element, "touchstart touchmove touchend touchcancel", handleEvents);
        }

        // for non-touch
        if (!_has_touch || options.allow_touch_and_mouse) {
            removeEvent(element, "mouseup mousedown mousemove", handleEvents);
            removeEvent(element, "mouseout", handleMouseOut);
        }
    };


    /**
     * count the number of fingers in the event
     * when no fingers are detected, one finger is returned (mouse pointer)
     * @param  event
     * @return int  fingers
     */
    function countFingers( event )
    {
        // there is a bug on android (until v4?) that touches is always 1,
        // so no multitouch is supported, e.g. no, zoom and rotation...
        return event.touches ? event.touches.length : 1;
    }

    /**
     * Gets the event xy positions from a mouse event.
     * @param event
     * @return {Array}
     */
    function getXYMouse(event) {
        var doc = document,
            body = doc.body;

        return [{
            x: event.pageX || event.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && doc.clientLeft || 0 ),
            y: event.pageY || event.clientY + ( doc && doc.scrollTop || body && body.scrollTop || 0 ) - ( doc && doc.clientTop || body && doc.clientTop || 0 )
        }];
    }

    /**
     * gets the event xy positions from touch event.
     * @param event
     * @return {Array}
     */
    function getXYTouch(event) {
        var pos = [], src;
        for(var t=0, len = options.two_touch_max ? Math.min(2, event.touches.length) : event.touches.length; t<len; t++) {
            src = event.touches[t];
            pos.push({ x: src.pageX, y: src.pageY });
        }
        return pos;
    }

    /**
     * get the x and y positions from the event object
     * @param  event
     * @return array  [{ x: int, y: int }]
     */
    function getXYfromEvent(event)
    {
        var _fn = getXYMouse;
        event = event || window.event;

        // no touches, use the event pageX and pageY
        if (!_has_touch) {
            if (options.allow_touch_and_mouse &&
                event.touches !== undefined && event.touches.length > 0) {

                _fn = getXYTouch;
            }
        } else {
            _fn = getXYTouch;
        }

        return _fn(event);
    }


    /**
     * calculate the angle between two points
     * @param   object  pos1 { x: int, y: int }
     * @param   object  pos2 { x: int, y: int }
     */
    function getAngle( pos1, pos2 )
    {
        return Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x) * 180 / Math.PI;
    }

    /**
     * calculate the distance between two points
     * @param   object  pos1 { x: int, y: int }
     * @param   object  pos2 { x: int, y: int }
     */
    function getDistance( pos1, pos2 )
    {
        var x = pos2.x - pos1.x, y = pos2.y - pos1.y;
        return Math.sqrt((x * x) + (y * y));
    }


    /**
     * calculate the scale size between two fingers
     * @param   object  pos_start
     * @param   object  pos_move
     * @return  float   scale
     */
    function calculateScale(pos_start, pos_move)
    {
        if(pos_start.length == 2 && pos_move.length == 2) {
            var start_distance = getDistance(pos_start[0], pos_start[1]);
            var end_distance = getDistance(pos_move[0], pos_move[1]);
            return end_distance / start_distance;
        }

        return 0;
    }


    /**
     * calculate the rotation degrees between two fingers
     * @param   object  pos_start
     * @param   object  pos_move
     * @return  float   rotation
     */
    function calculateRotation(pos_start, pos_move)
    {
        if(pos_start.length == 2 && pos_move.length == 2) {
            var start_rotation = getAngle(pos_start[1], pos_start[0]);
            var end_rotation = getAngle(pos_move[1], pos_move[0]);
            return end_rotation - start_rotation;
        }

        return 0;
    }


    /**
     * trigger an event/callback by name with params
     * @param string name
     * @param array  params
     */
    function triggerEvent( eventName, params )
    {
        // return touches object
        params.touches = getXYfromEvent(params.originalEvent);
        params.type = eventName;

        // trigger callback
        if(isFunction(self["on"+ eventName])) {
            self["on"+ eventName].call(self, params);
        }
    }


    /**
     * cancel event
     * @param   object  event
     * @return  void
     */

    function cancelEvent(event)
    {
        event = event || window.event;
        if(event.preventDefault){
            event.preventDefault();
            event.stopPropagation();
        }else{
            event.returnValue = false;
            event.cancelBubble = true;
        }
    }


    /**
     * reset the internal vars to the start values
     */
    function reset()
    {
        _pos = {};
        _first = false;
        _fingers = 0;
        _distance = 0;
        _angle = 0;
        _gesture = null;
    }


    var gestures = {
        // hold gesture
        // fired on touchstart
        hold : function(event)
        {
            // only when one finger is on the screen
            if(options.hold) {
                _gesture = 'hold';
                clearTimeout(_hold_timer);

                _hold_timer = setTimeout(function() {
                    if(_gesture == 'hold') {
                        triggerEvent("hold", {
                            originalEvent   : event,
                            position        : _pos.start
                        });
                    }
                }, options.hold_timeout);
            }
        },

        // swipe gesture
        // fired on touchend
        swipe : function(event)
        {
            if (!_pos.move || _gesture === "transform") {
                return;
            }

            // get the distance we moved
            var _distance_x = _pos.move[0].x - _pos.start[0].x;
            var _distance_y = _pos.move[0].y - _pos.start[0].y;
            _distance = Math.sqrt(_distance_x*_distance_x + _distance_y*_distance_y);

            // compare the kind of gesture by time
            var now = new Date().getTime();
            var touch_time = now - _touch_start_time;

            if(options.swipe && (options.swipe_time >= touch_time) && (_distance >= options.swipe_min_distance)) {
                // calculate the angle
                _angle = getAngle(_pos.start[0], _pos.move[0]);
                _direction = self.getDirectionFromAngle(_angle);

                _gesture = 'swipe';

                var position = { x: _pos.move[0].x - _offset.left,
                    y: _pos.move[0].y - _offset.top };

                var event_obj = {
                    originalEvent   : event,
                    position        : position,
                    direction       : _direction,
                    distance        : _distance,
                    distanceX       : _distance_x,
                    distanceY       : _distance_y,
                    angle           : _angle
                };

                // normal slide event
                triggerEvent("swipe", event_obj);
            }
        },


        // drag gesture
        // fired on mousemove
        drag : function(event)
        {
            // get the distance we moved
            var _distance_x = _pos.move[0].x - _pos.start[0].x;
            var _distance_y = _pos.move[0].y - _pos.start[0].y;
            _distance = Math.sqrt(_distance_x * _distance_x + _distance_y * _distance_y);

            // drag
            // minimal movement required
            if(options.drag && (_distance > options.drag_min_distance) || _gesture == 'drag') {
                // calculate the angle
                _angle = getAngle(_pos.start[0], _pos.move[0]);
                _direction = self.getDirectionFromAngle(_angle);

                // check the movement and stop if we go in the wrong direction
                var is_vertical = (_direction == 'up' || _direction == 'down');

                if(((is_vertical && !options.drag_vertical) || (!is_vertical && !options.drag_horizontal)) && (_distance > options.drag_min_distance)) {
                    return;
                }

                _gesture = 'drag';

                var position = { x: _pos.move[0].x - _offset.left,
                    y: _pos.move[0].y - _offset.top };

                var event_obj = {
                    originalEvent   : event,
                    position        : position,
                    direction       : _direction,
                    distance        : _distance,
                    distanceX       : _distance_x,
                    distanceY       : _distance_y,
                    angle           : _angle
                };

                // on the first time trigger the start event
                if(_first) {
                    triggerEvent("dragstart", event_obj);

                    _first = false;
                }

                // normal slide event
                triggerEvent("drag", event_obj);

                cancelEvent(event);
            }
        },


        // transform gesture
        // fired on touchmove
        transform : function(event)
        {
            if(options.transform) {
                var count = countFingers(event);
                if (count !== 2) {
                    return false;
                }

                var rotation = calculateRotation(_pos.start, _pos.move);
                var scale = calculateScale(_pos.start, _pos.move);

                if (_gesture === 'transform' ||
                    Math.abs(1 - scale) > options.scale_treshold ||
                    Math.abs(rotation) > options.rotation_treshold) {

                    _gesture = 'transform';
                    _pos.center = {
                        x: ((_pos.move[0].x + _pos.move[1].x) / 2) - _offset.left,
                        y: ((_pos.move[0].y + _pos.move[1].y) / 2) - _offset.top
                    };

                    if(_first)
                        _pos.startCenter = _pos.center;

                    var _distance_x = _pos.center.x - _pos.startCenter.x;
                    var _distance_y = _pos.center.y - _pos.startCenter.y;
                    _distance = Math.sqrt(_distance_x*_distance_x + _distance_y*_distance_y);

                    var event_obj = {
                        originalEvent   : event,
                        position        : _pos.center,
                        scale           : scale,
                        rotation        : rotation,
                        distance        : _distance,
                        distanceX       : _distance_x,
                        distanceY       : _distance_y
                    };

                    // on the first time trigger the start event
                    if (_first) {
                        triggerEvent("transformstart", event_obj);
                        _first = false;
                    }

                    triggerEvent("transform", event_obj);

                    cancelEvent(event);

                    return true;
                }
            }

            return false;
        },


        // tap and double tap gesture
        // fired on touchend
        tap : function(event)
        {
            // compare the kind of gesture by time
            var now = new Date().getTime();
            var touch_time = now - _touch_start_time;

            // dont fire when hold is fired
            if(options.hold && !(options.hold && options.hold_timeout > touch_time)) {
                return;
            }

            // when previous event was tap and the tap was max_interval ms ago
            var is_double_tap = (function(){
                if (_prev_tap_pos &&
                    options.tap_double &&
                    _prev_gesture == 'tap' &&
                    _pos.start &&
                    (_touch_start_time - _prev_tap_end_time) < options.tap_max_interval)
                {
                    var x_distance = Math.abs(_prev_tap_pos[0].x - _pos.start[0].x);
                    var y_distance = Math.abs(_prev_tap_pos[0].y - _pos.start[0].y);
                    return (_prev_tap_pos && _pos.start && Math.max(x_distance, y_distance) < options.tap_double_distance);
                }
                return false;
            })();

            if(is_double_tap) {
                _gesture = 'double_tap';
                _prev_tap_end_time = null;

                triggerEvent("doubletap", {
                    originalEvent   : event,
                    position        : _pos.start
                });
                cancelEvent(event);
            }

            // single tap is single touch
            else {
                var x_distance = (_pos.move) ? Math.abs(_pos.move[0].x - _pos.start[0].x) : 0;
                var y_distance =  (_pos.move) ? Math.abs(_pos.move[0].y - _pos.start[0].y) : 0;
                _distance = Math.max(x_distance, y_distance);

                if(_distance < options.tap_max_distance) {
                    _gesture = 'tap';
                    _prev_tap_end_time = now;
                    _prev_tap_pos = _pos.start;

                    if(options.tap) {
                        triggerEvent("tap", {
                            originalEvent   : event,
                            position        : _pos.start
                        });
                        cancelEvent(event);
                    }
                }
            }
        }
    };


    function handleEvents(event)
    {
        var count;
        switch(event.type)
        {
            case 'mousedown':
            case 'touchstart':
                count = countFingers(event);
                _can_tap = count === 1;

                //We were dragging and now we are zooming.
                if (count === 2 && _gesture === "drag") {

                    //The user needs to have the dragend to be fired to ensure that
                    //there is proper cleanup from the drag and move onto transforming.
                    triggerEvent("dragend", {
                        originalEvent   : event,
                        direction       : _direction,
                        distance        : _distance,
                        angle           : _angle
                    });
                }
                _setup();

                if(options.prevent_default) {
                    cancelEvent(event);
                }
                break;

            case 'mousemove':
            case 'touchmove':
                count = countFingers(event);

                //The user has gone from transforming to dragging.  The
                //user needs to have the proper cleanup of the state and
                //setup with the new "start" points.
                if (!_mousedown && count === 1) {
                    return false;
                } else if (!_mousedown && count === 2) {
                    _can_tap = false;

                    reset();
                    _setup();
                }

                _event_move = event;
                _pos.move = getXYfromEvent(event);

                if(!gestures.transform(event)) {
                    gestures.drag(event);
                }
                break;

            case 'mouseup':
            case 'mouseout':
            case 'touchcancel':
            case 'touchend':
                var callReset = true;

                _mousedown = false;
                _event_end = event;

                // swipe gesture
                gestures.swipe(event);

                // drag gesture
                // dragstart is triggered, so dragend is possible
                if(_gesture == 'drag') {
                    triggerEvent("dragend", {
                        originalEvent   : event,
                        direction       : _direction,
                        distance        : _distance,
                        angle           : _angle
                    });
                }

                // transform
                // transformstart is triggered, so transformed is possible
                else if(_gesture == 'transform') {
                    // define the transform distance
                    var _distance_x = _pos.center.x - _pos.startCenter.x;
                    var _distance_y = _pos.center.y - _pos.startCenter.y;
                    
                    triggerEvent("transformend", {
                        originalEvent   : event,
                        position        : _pos.center,
                        scale           : calculateScale(_pos.start, _pos.move),
                        rotation        : calculateRotation(_pos.start, _pos.move),
                        distance        : _distance,
                        distanceX       : _distance_x,
                        distanceY       : _distance_y
                    });

                    //If the user goes from transformation to drag there needs to be a
                    //state reset so that way a dragstart/drag/dragend will be properly
                    //fired.
                    if (countFingers(event) === 1) {
                        reset();
                        _setup();
                        callReset = false;
                    }
                } else if (_can_tap && event.type != 'mouseout') {
                    gestures.tap(_event_start);
                }
                
                if (_gesture !== null) {
	                _prev_gesture = _gesture;
	
	                // trigger release event
	                // "release" by default doesn't return the co-ords where your
	                // finger was released. "position" will return "the last touched co-ords"
	
	                triggerEvent("release", {
	                    originalEvent   : event,
	                    gesture         : _gesture,
	                    position        : _pos.move || _pos.start
	                });
                }
                
                // reset vars if this was not a transform->drag touch end operation.
                if (callReset) {
                    reset();
                }
                break;
        } // end switch

        /**
         * Performs a blank setup.
         * @private
         */
        function _setup() {
            _pos.start = getXYfromEvent(event);
            _touch_start_time = new Date().getTime();
            _fingers = countFingers(event);
            _first = true;
            _event_start = event;

            // borrowed from jquery offset https://github.com/jquery/jquery/blob/master/src/offset.js
            var box = element.getBoundingClientRect();
            var clientTop  = element.clientTop  || document.body.clientTop  || 0;
            var clientLeft = element.clientLeft || document.body.clientLeft || 0;
            var scrollTop  = window.pageYOffset || element.scrollTop  || document.body.scrollTop;
            var scrollLeft = window.pageXOffset || element.scrollLeft || document.body.scrollLeft;

            _offset = {
                top: box.top + scrollTop - clientTop,
                left: box.left + scrollLeft - clientLeft
            };

            _mousedown = true;

            // hold gesture
            gestures.hold(event);
        }
    }


    function handleMouseOut(event) {
        if(!isInsideHammer(element, event.relatedTarget)) {
            handleEvents(event);
        }
    }


    // bind events for touch devices
    // except for windows phone 7.5, it doesnt support touch events..!
    if(_has_touch || options.allow_touch_and_mouse) {
        addEvent(element, "touchstart touchmove touchend touchcancel", handleEvents);
    }

    // for non-touch
    if (!_has_touch || options.allow_touch_and_mouse) {
        addEvent(element, "mouseup mousedown mousemove", handleEvents);
        addEvent(element, "mouseout", handleMouseOut);
    }


    /**
     * find if element is (inside) given parent element
     * @param   object  element
     * @param   object  parent
     * @return  bool    inside
     */
    function isInsideHammer(parent, child) {
        // get related target for IE
        if(!child && window.event && window.event.toElement){
            child = window.event.toElement;
        }

        if(parent === child){
            return true;
        }

        // loop over parentNodes of child until we find hammer element
        if(child){
            var node = child.parentNode;
            while(node !== null){
                if(node === parent){
                    return true;
                }
                node = node.parentNode;
            }
        }
        return false;
    }


    /**
     * merge 2 objects into a new object
     * @param   object  obj1
     * @param   object  obj2
     * @return  object  merged object
     */
    function mergeObject(obj1, obj2) {
        var output = {};

        if(!obj2) {
            return obj1;
        }

        for (var prop in obj1) {
            if (prop in obj2) {
                output[prop] = obj2[prop];
            } else {
                output[prop] = obj1[prop];
            }
        }
        return output;
    }


    /**
     * check if object is a function
     * @param   object  obj
     * @return  bool    is function
     */
    function isFunction( obj ){
        return Object.prototype.toString.call( obj ) == "[object Function]";
    }


    /**
     * attach event
     * @param   node    element
     * @param   string  types
     * @param   object  callback
     */
    function addEvent(element, types, callback) {
        types = types.split(" ");
        for(var t= 0,len=types.length; t<len; t++) {
            if(element.addEventListener){
                element.addEventListener(types[t], callback, false);
            }
            else if(document.attachEvent){
                element.attachEvent("on"+ types[t], callback);
            }
        }
    }


    /**
     * detach event
     * @param   node    element
     * @param   string  types
     * @param   object  callback
     */
    function removeEvent(element, types, callback) {
        types = types.split(" ");
        for(var t= 0,len=types.length; t<len; t++) {
            if(element.removeEventListener){
                element.removeEventListener(types[t], callback, false);
            }
            else if(document.detachEvent){
                element.detachEvent("on"+ types[t], callback);
            }
        }
    }
}

// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
window.requestAnimFrame = (function() {
	return  window.requestAnimationFrame       || 
		window.webkitRequestAnimationFrame || 
		window.mozRequestAnimationFrame    || 
		window.oRequestAnimationFrame      || 
		window.msRequestAnimationFrame     || 
		function(/* function */ callback, /* DOMElement */ element){
			window.setTimeout(callback, 1000 / 60);
		};
})();

// This demo is based on: http://www.ewjordan.com/processing/VolumeBlob/

function init() {
	var width = window.innerWidth;
	var height = window.innerHeight;
	canvas.getContext("2d").canvas.width  = width;
	canvas.getContext("2d").canvas.height = height;
	background.getContext("2d").canvas.width  = width;
	background.getContext("2d").canvas.height = height;
	var EPS = 0.0001;
	var x = [];
	var y = [];
	var xLast = [];
	var yLast = [];
	var ax = [];
	var ay = [];
	var nParts = 40;
	var tStep = 1.0/60.0;
	var perimIters = 5; //number of perimiter fixing iterations to do - more means closer to perfect solidity
	var relaxFactor = 0.9; //1.0 would mean perfect solidity (no blobbiness) if it worked (unstable)
	var gravityForce = -9.8;
	var rad = 10.0;
	var blobAreaTarget;
	var sideLength;
	var mouseRad = 5.0;
	var rotateAccel = 1.0;
	var mousePos = [width/20, height/20];

	var earth = new Image();
	var unloaded = 1;
	earth.onload = function() {
		--unloaded;
	};
	earth.src = 'https://pickelbite2.github.io/games_3/squishyearth/earth.png';

	var moon = new Image();
	++unloaded;
	moon.onload = function() {
		--unloaded;
	};
	moon.src = 'https://pickelbite2.github.io/games_3/squishyearth/moon.png';

	var hammer = new Hammer(document.getElementById("canvas"), {prevent_default:true});
	addEvent("mousemove", document.getElementById('canvas'), onMove);

	renderBackground();
	setupParticles();
	requestAnimFrame(update);

	function addEvent(evnt, elem, func) {
		if (elem.addEventListener)  // W3C DOM
			elem.addEventListener(evnt,func,false);
		else if (elem.attachEvent) { // IE DOM
			elem.attachEvent("on"+evnt, func);
		}
		else {
			elem[evnt] = func;
		}
	}

	function renderBackground() {
		var ctx = background.getContext("2d");
		ctx.clearRect(0, 0, width, height);

		var area = width * height;
		for (var i = 0; i < area/10000; ++i) {
			ctx.beginPath();
			ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 2, 0, Math.PI*2, true);
			ctx.fillStyle = "white";
			ctx.fill();
		}
		for (var i = 0; i < area/1000; ++i) {
			ctx.beginPath();
			ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 0.5, 0, Math.PI*2, true);
			ctx.fillStyle = "white";
			ctx.fill();
		}
	}

	hammer.ondrag = function(e) {
		var p = mapInv([Math.round(e.position.x), Math.round(e.position.y)]);
		if (!isPointInBlob(p)) {
			mousePos = p;
		}
	};

	function setupParticles() {
		x = new Array(nParts);
		y = new Array(nParts);
		xLast = new Array(nParts);
		yLast = new Array(nParts);
		ax = new Array(nParts);
		ay = new Array(nParts);

		var cx = width/20;
		var cy = height/20;
		for (var i=0; i<nParts; ++i) {
			var ang = i*2*Math.PI / nParts;
			x[i] = cx + Math.sin(ang)*rad;
			y[i] = cy + Math.cos(ang)*rad;
			xLast[i] = x[i];
			yLast[i] = y[i];
			ax[i] = 0;
			ay[i] = 0;
		}

		sideLength = Math.sqrt( (x[1]-x[0])*(x[1]-x[0])+(y[1]-y[0])*(y[1]-y[0]) );

		blobAreaTarget = getArea();
		fixPerimeter();
	}

	function getArea() {
		var area = 0.0;
		area += x[nParts-1]*y[0]-x[0]*y[nParts-1];
		for (var i=0; i<nParts-1; ++i){
			area += x[i]*y[i+1]-x[i+1]*y[i];
		}
		area *= 0.5;
		return area;
	}

	function integrateParticles(dt) {
		var dtSquared = dt*dt;
		var gravityAddY = -gravityForce * dtSquared;
		for (var i=0; i<nParts; ++i) {
			var bufferX = x[i];
			var bufferY = y[i];
			x[i] = 2*x[i] - xLast[i] + ax[i]*dtSquared;
			y[i] = 2*y[i] - yLast[i] + ay[i]*dtSquared + gravityAddY;
			xLast[i] = bufferX;
			yLast[i] = bufferY;
			ax[i] = 0;
			ay[i] = 0;
		}
	}

	function collideWithEdge() {
		for (var i=0; i<nParts; ++i) {
			if (x[i] < 0) {
				x[i] = 0;
				yLast[i] = y[i];
			}
			else if (x[i] > width/10) {
				x[i] = width/10;
				yLast[i] = y[i];
			}
			if (y[i] < 0) {
				y[i] = 0;
				xLast[i] = x[i];
			} else if (y[i] > height/10) {
				y[i] = height/10;
				xLast[i] = x[i];
			}
		}
	}

	function fixPerimeter() {
		// Fix up side lengths
		var diffx = new Array(nParts);
		var diffy = new Array(nParts);
		for (var i = 0; i < nParts; ++i) {
			diffx[i] = 0;
			diffy[i] = 0;
		}

		for (var j=0; j<perimIters; ++j) {
			for (var i=0; i<nParts; ++i) {
				var next = (i==nParts-1)?0:i+1;
				var dx = x[next]-x[i];
				var dy = y[next]-y[i];
				var distance = Math.sqrt(dx*dx+dy*dy);
				if (distance < EPS) distance = 1.0;
				var diffRatio = 1.0 - sideLength / distance;
				diffx[i] += 0.5*relaxFactor * dx * diffRatio;
				diffy[i] += 0.5*relaxFactor * dy * diffRatio;
				diffx[next] -= 0.5*relaxFactor * dx * diffRatio;
				diffy[next] -= 0.5*relaxFactor * dy * diffRatio;
			}

			for (var i=0; i<nParts; ++i) {
				x[i] += diffx[i];
				y[i] += diffy[i];
				diffx[i] = 0;
				diffy[i] = 0;
			}
		}
	}

	function constrainBlobEdges() {
		fixPerimeter();
		var perimeter = 0.0;
		var nx = new Array(nParts); //normals
		var ny = new Array(nParts);
		for (var i=0; i<nParts; ++i) {
			var next = (i==nParts-1)?0:i+1;
			var dx = x[next]-x[i];
			var dy = y[next]-y[i];
			var distance = Math.sqrt(dx*dx+dy*dy);
			if (distance < EPS) distance = 1.0;
			nx[i] = dy / distance;
			ny[i] = -dx / distance;
			perimeter += distance;
		}

		var deltaArea = blobAreaTarget - getArea();
		var toExtrude = 0.5*deltaArea / perimeter;

		for (var i=0; i<nParts; ++i) {
			var next = (i==nParts-1)?0:i+1;
			x[next] += toExtrude * (nx[i] + nx[next]);
			y[next] += toExtrude * (ny[i] + ny[next]);
		}
	}

	function collideWithMouse() {
		if (isPointInBlob(mousePos)) {
			mousePos[1] = 1000;
		}
		var mx = mousePos[0];
		var my = mousePos[1];
		for (var i=0; i<nParts; ++i) {
			var dx = mx-x[i];
			var dy = my-y[i];
			var distSqr = dx*dx+dy*dy;
			if (distSqr > mouseRad*mouseRad) continue;
			if (distSqr < EPS*EPS) continue;
			var distance = Math.sqrt(distSqr);
			x[i] -= dx*(mouseRad/distance-1.0);
			y[i] -= dy*(mouseRad/distance-1.0);
		}
	}

	window.onresize = function(event) {
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.getContext("2d").canvas.width  = width;
		canvas.getContext("2d").canvas.height = height;
		background.getContext("2d").canvas.width  = width;
		background.getContext("2d").canvas.height = height;
		renderBackground();
		setupParticles();
	}

	function update() {
		for (var i=0; i<3; ++i) {
			integrateParticles(tStep);
			constrainBlobEdges();
			collideWithEdge();
			collideWithMouse();
		}

		var canvas = document.getElementById('canvas');
		var ctx = canvas.getContext("2d");

		ctx.clearRect(0, 0, width, height);
		draw(ctx);
		drawMouse(ctx);

		requestAnimFrame(update);
	}

	function onMove(e) {
		var p = mapInv(getCursorPosition(e));
		if (!isPointInBlob(p)) {
			mousePos = p;
		}
	}

	function isPointInBlob(p){
	    for(var c = false, i = -1, l = nParts, j = l - 1; ++i < l; j = i)
		((y[i] <= p[1] && p[1] < y[j]) || (y[j] <= p[1] && p[1] < y[i]))
		&& (p[0] < (x[j] - x[i]) * (p[1] - y[i]) / (y[j] - y[i]) + x[i])
		&& (c = !c);
	    return c;
	}

	function getCursorPosition(e) {
		var x;
		var y;
		if (e.pageX || e.pageY) { 
			x = e.pageX;
			y = e.pageY;
		}
		else { 
			x = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft; 
			y = e.clientY + document.body.scrollTop + document.documentElement.scrollTop; 
		}
		var canvas = document.getElementById('canvas');
		x -= canvas.offsetLeft;
		y -= canvas.offsetTop;
		return [x, y];
	}

	function drawMouse(ctx) {
		if (unloaded == 0) {
			var p = map(mousePos);
        		ctx.drawImage(moon, p[0] - (mouseRad*10), p[1] - (mouseRad*10), mouseRad*20, mouseRad*20);
		}
	}

	function draw(ctx) {
		if (unloaded == 0) {
			var center_x = 0;
			var center_y = 0;
			for (var i = 0; i < nParts; ++i) {
				center_x += x[i];
				center_y += y[i];
			}
			center_x /= nParts;
			center_y /= nParts;
			var p1 = map([center_x, center_y]);

			var n = nParts/2;
			for (var i = 0; i < n; ++i) {
				var j = i * nParts/n;
				var k = (i+1) * nParts/n;
				if (k == nParts) k = 0;
				var p2 = map([x[j], y[j]]);
				var p3 = map([x[k], y[k]]);
				var a1 = 2*Math.PI * (i / n);
				var a2 = 2*Math.PI * ((i+1) / n);
				var p4 = [earth.width/2 + Math.sin(a1) * earth.width/2, earth.height/2 + Math.cos(a1) * earth.height/2];
				var p5 = [earth.width/2 + Math.sin(a2) * earth.width/2, earth.height/2 + Math.cos(a2) * earth.height/2];
				textureMap(ctx, earth, [{x:p1[0],y:p1[1],u:earth.width/2,v:earth.height/2}, {x:p2[0],y:p2[1],u:p4[0],v:p4[1]}, {x:p3[0],y:p3[1],u:p5[0],v:p5[1]}]);
			}
		}
	}

	//http://stackoverflow.com/questions/4774172/image-manipulation-and-texture-mapping-using-html5-canvas
	function textureMap(ctx, texture, pts) {
		var x0 = pts[0].x, x1 = pts[1].x, x2 = pts[2].x;
		var y0 = pts[0].y, y1 = pts[1].y, y2 = pts[2].y;
		var u0 = pts[0].u, u1 = pts[1].u, u2 = pts[2].u;
		var v0 = pts[0].v, v1 = pts[1].v, v2 = pts[2].v;
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(x0, y0);
		ctx.lineTo(x1 + (x1-x0), y1 + (y1-y0));
		ctx.lineTo(x2 + (x2-x0), y2 + (y2-y0));
		ctx.closePath(); ctx.clip();
		var delta = u0*v1 + v0*u2 + u1*v2 - v1*u2 - v0*u1 - u0*v2;
		var delta_a = x0*v1 + v0*x2 + x1*v2 - v1*x2 - v0*x1 - x0*v2;
		var delta_b = u0*x1 + x0*u2 + u1*x2 - x1*u2 - x0*u1 - u0*x2;
		var delta_c = u0*v1*x2 + v0*x1*u2 + x0*u1*v2 - x0*v1*u2
			      - v0*u1*x2 - u0*x1*v2;
		var delta_d = y0*v1 + v0*y2 + y1*v2 - v1*y2 - v0*y1 - y0*v2;
		var delta_e = u0*y1 + y0*u2 + u1*y2 - y1*u2 - y0*u1 - u0*y2;
		var delta_f = u0*v1*y2 + v0*y1*u2 + y0*u1*v2 - y0*v1*u2
			      - v0*u1*y2 - u0*y1*v2;
		ctx.transform(delta_a/delta, delta_d/delta,
			      delta_b/delta, delta_e/delta,
			      delta_c/delta, delta_f/delta);
		ctx.drawImage(texture, 0, 0);
		ctx.restore();
	}

	function map(p) {
		return [p[0] * 10, p[1] * 10];
	}

	function mapInv(p) {
		return [p[0] / 10, p[1] / 10];
	}
};

(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
  })(window,document,'script','//www.google-analytics.com/analytics.js','ga');
  ga('create', 'UA-44860129-1', 'byronknoll.com');
  ga('send', 'pageview');