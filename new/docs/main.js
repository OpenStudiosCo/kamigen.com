(function () {
    'use strict';

    (function() {
        const env = {"NODE_ENV":"production"};
        try {
            if (process) {
                process.env = Object.assign({}, process.env);
                Object.assign(process.env, env);
                return;
            }
        } catch (e) {} // avoid ReferenceError: process is not defined
        globalThis.process = { env:env };
    })();

    function __rest(s, e) {
        var t = {};
        for (var p in s) { if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
            { t[p] = s[p]; } }
        if (s != null && typeof Object.getOwnPropertySymbols === "function")
            { for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
                if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                    { t[p[i]] = s[p[i]]; }
            } }
        return t;
    }

    var warning = function () { };
    var invariant = function () { };
    if (process.env.NODE_ENV !== 'production') {
        warning = function (check, message) {
            if (!check && typeof console !== 'undefined') {
                console.warn(message);
            }
        };
        invariant = function (check, message) {
            if (!check) {
                throw new Error(message);
            }
        };
    }

    var clamp$1 = function (min, max, v) { return Math.min(Math.max(v, min), max); };

    var safeMin = 0.001;
    var minDuration = 0.01;
    var maxDuration = 10.0;
    var minDamping = 0.05;
    var maxDamping = 1;
    function findSpring(ref) {
        var duration = ref.duration; if ( duration === void 0 ) duration = 800;
        var bounce = ref.bounce; if ( bounce === void 0 ) bounce = 0.25;
        var velocity = ref.velocity; if ( velocity === void 0 ) velocity = 0;
        var mass = ref.mass; if ( mass === void 0 ) mass = 1;

        var envelope;
        var derivative;
        warning(duration <= maxDuration * 1000, "Spring duration must be 10 seconds or less");
        var dampingRatio = 1 - bounce;
        dampingRatio = clamp$1(minDamping, maxDamping, dampingRatio);
        duration = clamp$1(minDuration, maxDuration, duration / 1000);
        if (dampingRatio < 1) {
            envelope = function (undampedFreq) {
                var exponentialDecay = undampedFreq * dampingRatio;
                var delta = exponentialDecay * duration;
                var a = exponentialDecay - velocity;
                var b = calcAngularFreq(undampedFreq, dampingRatio);
                var c = Math.exp(-delta);
                return safeMin - (a / b) * c;
            };
            derivative = function (undampedFreq) {
                var exponentialDecay = undampedFreq * dampingRatio;
                var delta = exponentialDecay * duration;
                var d = delta * velocity + velocity;
                var e = Math.pow(dampingRatio, 2) * Math.pow(undampedFreq, 2) * duration;
                var f = Math.exp(-delta);
                var g = calcAngularFreq(Math.pow(undampedFreq, 2), dampingRatio);
                var factor = -envelope(undampedFreq) + safeMin > 0 ? -1 : 1;
                return (factor * ((d - e) * f)) / g;
            };
        }
        else {
            envelope = function (undampedFreq) {
                var a = Math.exp(-undampedFreq * duration);
                var b = (undampedFreq - velocity) * duration + 1;
                return -safeMin + a * b;
            };
            derivative = function (undampedFreq) {
                var a = Math.exp(-undampedFreq * duration);
                var b = (velocity - undampedFreq) * (duration * duration);
                return a * b;
            };
        }
        var initialGuess = 5 / duration;
        var undampedFreq = approximateRoot(envelope, derivative, initialGuess);
        duration = duration * 1000;
        if (isNaN(undampedFreq)) {
            return {
                stiffness: 100,
                damping: 10,
                duration: duration,
            };
        }
        else {
            var stiffness = Math.pow(undampedFreq, 2) * mass;
            return {
                stiffness: stiffness,
                damping: dampingRatio * 2 * Math.sqrt(mass * stiffness),
                duration: duration,
            };
        }
    }
    var rootIterations = 12;
    function approximateRoot(envelope, derivative, initialGuess) {
        var result = initialGuess;
        for (var i = 1; i < rootIterations; i++) {
            result = result - envelope(result) / derivative(result);
        }
        return result;
    }
    function calcAngularFreq(undampedFreq, dampingRatio) {
        return undampedFreq * Math.sqrt(1 - dampingRatio * dampingRatio);
    }

    var durationKeys = ["duration", "bounce"];
    var physicsKeys = ["stiffness", "damping", "mass"];
    function isSpringType(options, keys) {
        return keys.some(function (key) { return options[key] !== undefined; });
    }
    function getSpringOptions(options) {
        var springOptions = Object.assign({ velocity: 0.0, stiffness: 100, damping: 10, mass: 1.0, isResolvedFromDuration: false }, options);
        if (!isSpringType(options, physicsKeys) &&
            isSpringType(options, durationKeys)) {
            var derived = findSpring(options);
            springOptions = Object.assign(Object.assign(Object.assign({}, springOptions), derived), { velocity: 0.0, mass: 1.0 });
            springOptions.isResolvedFromDuration = true;
        }
        return springOptions;
    }
    function spring(_a) {
        var from = _a.from; if ( from === void 0 ) from = 0.0;
        var to = _a.to; if ( to === void 0 ) to = 1.0;
        var restSpeed = _a.restSpeed; if ( restSpeed === void 0 ) restSpeed = 2;
        var restDelta = _a.restDelta;
        var options = __rest(_a, ["from", "to", "restSpeed", "restDelta"]);
        var state = { done: false, value: from };
        var ref = getSpringOptions(options);
        var stiffness = ref.stiffness;
        var damping = ref.damping;
        var mass = ref.mass;
        var velocity = ref.velocity;
        var duration = ref.duration;
        var isResolvedFromDuration = ref.isResolvedFromDuration;
        var resolveSpring = zero;
        var resolveVelocity = zero;
        function createSpring() {
            var initialVelocity = velocity ? -(velocity / 1000) : 0.0;
            var initialDelta = to - from;
            var dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
            var undampedAngularFreq = Math.sqrt(stiffness / mass) / 1000;
            if (restDelta === undefined) {
                restDelta = Math.min(Math.abs(to - from) / 100, 0.4);
            }
            if (dampingRatio < 1) {
                var angularFreq = calcAngularFreq(undampedAngularFreq, dampingRatio);
                resolveSpring = function (t) {
                    var envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
                    return (to -
                        envelope *
                            (((initialVelocity +
                                dampingRatio * undampedAngularFreq * initialDelta) /
                                angularFreq) *
                                Math.sin(angularFreq * t) +
                                initialDelta * Math.cos(angularFreq * t)));
                };
                resolveVelocity = function (t) {
                    var envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
                    return (dampingRatio *
                        undampedAngularFreq *
                        envelope *
                        ((Math.sin(angularFreq * t) *
                            (initialVelocity +
                                dampingRatio *
                                    undampedAngularFreq *
                                    initialDelta)) /
                            angularFreq +
                            initialDelta * Math.cos(angularFreq * t)) -
                        envelope *
                            (Math.cos(angularFreq * t) *
                                (initialVelocity +
                                    dampingRatio *
                                        undampedAngularFreq *
                                        initialDelta) -
                                angularFreq *
                                    initialDelta *
                                    Math.sin(angularFreq * t)));
                };
            }
            else if (dampingRatio === 1) {
                resolveSpring = function (t) { return to -
                    Math.exp(-undampedAngularFreq * t) *
                        (initialDelta +
                            (initialVelocity + undampedAngularFreq * initialDelta) *
                                t); };
            }
            else {
                var dampedAngularFreq = undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1);
                resolveSpring = function (t) {
                    var envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
                    var freqForT = Math.min(dampedAngularFreq * t, 300);
                    return (to -
                        (envelope *
                            ((initialVelocity +
                                dampingRatio * undampedAngularFreq * initialDelta) *
                                Math.sinh(freqForT) +
                                dampedAngularFreq *
                                    initialDelta *
                                    Math.cosh(freqForT))) /
                            dampedAngularFreq);
                };
            }
        }
        createSpring();
        return {
            next: function (t) {
                var current = resolveSpring(t);
                if (!isResolvedFromDuration) {
                    var currentVelocity = resolveVelocity(t) * 1000;
                    var isBelowVelocityThreshold = Math.abs(currentVelocity) <= restSpeed;
                    var isBelowDisplacementThreshold = Math.abs(to - current) <= restDelta;
                    state.done =
                        isBelowVelocityThreshold && isBelowDisplacementThreshold;
                }
                else {
                    state.done = t >= duration;
                }
                state.value = state.done ? to : current;
                return state;
            },
            flipTarget: function () {
                var assign;

                velocity = -velocity;
                (assign = [to, from], from = assign[0], to = assign[1]);
                createSpring();
            },
        };
    }
    spring.needsInterpolation = function (a, b) { return typeof a === "string" || typeof b === "string"; };
    var zero = function (_t) { return 0; };

    var progress = function (from, to, value) {
        var toFromDifference = to - from;
        return toFromDifference === 0 ? 1 : (value - from) / toFromDifference;
    };

    var mix = function (from, to, progress) { return -progress * from + progress * to + from; };

    var clamp = function (min, max) { return function (v) { return Math.max(Math.min(v, max), min); }; };
    var sanitize = function (v) { return (v % 1 ? Number(v.toFixed(5)) : v); };
    var floatRegex = /(-)?([\d]*\.?[\d])+/g;
    var colorRegex = /(#[0-9a-f]{6}|#[0-9a-f]{3}|#(?:[0-9a-f]{2}){2,4}|(rgb|hsl)a?\((-?[\d\.]+%?[,\s]+){2}(-?[\d\.]+%?)\s*[\,\/]?\s*[\d\.]*%?\))/gi;
    var singleColorRegex = /^(#[0-9a-f]{3}|#(?:[0-9a-f]{2}){2,4}|(rgb|hsl)a?\((-?[\d\.]+%?[,\s]+){2}(-?[\d\.]+%?)\s*[\,\/]?\s*[\d\.]*%?\))$/i;
    function isString(v) {
        return typeof v === 'string';
    }

    var number = {
        test: function (v) { return typeof v === 'number'; },
        parse: parseFloat,
        transform: function (v) { return v; },
    };
    var alpha = Object.assign(Object.assign({}, number), { transform: clamp(0, 1) });
    Object.assign(Object.assign({}, number), { default: 1 });

    var createUnitType = function (unit) { return ({
        test: function (v) { return isString(v) && v.endsWith(unit) && v.split(' ').length === 1; },
        parse: parseFloat,
        transform: function (v) { return ("" + v + unit); },
    }); };
    var percent = createUnitType('%');
    Object.assign(Object.assign({}, percent), { parse: function (v) { return percent.parse(v) / 100; }, transform: function (v) { return percent.transform(v * 100); } });

    var isColorString = function (type, testProp) { return function (v) {
        return Boolean((isString(v) && singleColorRegex.test(v) && v.startsWith(type)) ||
            (testProp && Object.prototype.hasOwnProperty.call(v, testProp)));
    }; };
    var splitColor = function (aName, bName, cName) { return function (v) {
        var obj;

        if (!isString(v))
            { return v; }
        var ref = v.match(floatRegex);
        var a = ref[0];
        var b = ref[1];
        var c = ref[2];
        var alpha = ref[3];
        return ( obj = {}, obj[aName] = parseFloat(a), obj[bName] = parseFloat(b), obj[cName] = parseFloat(c), obj.alpha = alpha !== undefined ? parseFloat(alpha) : 1, obj );
    }; };

    var hsla = {
        test: isColorString('hsl', 'hue'),
        parse: splitColor('hue', 'saturation', 'lightness'),
        transform: function (ref) {
            var hue = ref.hue;
            var saturation = ref.saturation;
            var lightness = ref.lightness;
            var alpha$1 = ref.alpha; if ( alpha$1 === void 0 ) alpha$1 = 1;

            return ('hsla(' +
                Math.round(hue) +
                ', ' +
                percent.transform(sanitize(saturation)) +
                ', ' +
                percent.transform(sanitize(lightness)) +
                ', ' +
                sanitize(alpha.transform(alpha$1)) +
                ')');
        },
    };

    var clampRgbUnit = clamp(0, 255);
    var rgbUnit = Object.assign(Object.assign({}, number), { transform: function (v) { return Math.round(clampRgbUnit(v)); } });
    var rgba = {
        test: isColorString('rgb', 'red'),
        parse: splitColor('red', 'green', 'blue'),
        transform: function (ref) {
            var red = ref.red;
            var green = ref.green;
            var blue = ref.blue;
            var alpha$1 = ref.alpha; if ( alpha$1 === void 0 ) alpha$1 = 1;

            return 'rgba(' +
            rgbUnit.transform(red) +
            ', ' +
            rgbUnit.transform(green) +
            ', ' +
            rgbUnit.transform(blue) +
            ', ' +
            sanitize(alpha.transform(alpha$1)) +
            ')';
    },
    };

    function parseHex(v) {
        var r = '';
        var g = '';
        var b = '';
        var a = '';
        if (v.length > 5) {
            r = v.substr(1, 2);
            g = v.substr(3, 2);
            b = v.substr(5, 2);
            a = v.substr(7, 2);
        }
        else {
            r = v.substr(1, 1);
            g = v.substr(2, 1);
            b = v.substr(3, 1);
            a = v.substr(4, 1);
            r += r;
            g += g;
            b += b;
            a += a;
        }
        return {
            red: parseInt(r, 16),
            green: parseInt(g, 16),
            blue: parseInt(b, 16),
            alpha: a ? parseInt(a, 16) / 255 : 1,
        };
    }
    var hex = {
        test: isColorString('#'),
        parse: parseHex,
        transform: rgba.transform,
    };

    var color = {
        test: function (v) { return rgba.test(v) || hex.test(v) || hsla.test(v); },
        parse: function (v) {
            if (rgba.test(v)) {
                return rgba.parse(v);
            }
            else if (hsla.test(v)) {
                return hsla.parse(v);
            }
            else {
                return hex.parse(v);
            }
        },
        transform: function (v) {
            return isString(v)
                ? v
                : v.hasOwnProperty('red')
                    ? rgba.transform(v)
                    : hsla.transform(v);
        },
    };

    var colorToken = '${c}';
    var numberToken = '${n}';
    function test(v) {
        var _a, _b, _c, _d;
        return (isNaN(v) &&
            isString(v) &&
            ((_b = (_a = v.match(floatRegex)) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) + ((_d = (_c = v.match(colorRegex)) === null || _c === void 0 ? void 0 : _c.length) !== null && _d !== void 0 ? _d : 0) > 0);
    }
    function analyse$1(v) {
        if (typeof v === 'number')
            { v = "" + v; }
        var values = [];
        var numColors = 0;
        var colors = v.match(colorRegex);
        if (colors) {
            numColors = colors.length;
            v = v.replace(colorRegex, colorToken);
            values.push.apply(values, colors.map(color.parse));
        }
        var numbers = v.match(floatRegex);
        if (numbers) {
            v = v.replace(floatRegex, numberToken);
            values.push.apply(values, numbers.map(number.parse));
        }
        return { values: values, numColors: numColors, tokenised: v };
    }
    function parse(v) {
        return analyse$1(v).values;
    }
    function createTransformer(v) {
        var ref = analyse$1(v);
        var values = ref.values;
        var numColors = ref.numColors;
        var tokenised = ref.tokenised;
        var numValues = values.length;
        return function (v) {
            var output = tokenised;
            for (var i = 0; i < numValues; i++) {
                output = output.replace(i < numColors ? colorToken : numberToken, i < numColors ? color.transform(v[i]) : sanitize(v[i]));
            }
            return output;
        };
    }
    var convertNumbersToZero = function (v) { return typeof v === 'number' ? 0 : v; };
    function getAnimatableNone(v) {
        var parsed = parse(v);
        var transformer = createTransformer(v);
        return transformer(parsed.map(convertNumbersToZero));
    }
    var complex = { test: test, parse: parse, createTransformer: createTransformer, getAnimatableNone: getAnimatableNone };

    function hueToRgb(p, q, t) {
        if (t < 0)
            { t += 1; }
        if (t > 1)
            { t -= 1; }
        if (t < 1 / 6)
            { return p + (q - p) * 6 * t; }
        if (t < 1 / 2)
            { return q; }
        if (t < 2 / 3)
            { return p + (q - p) * (2 / 3 - t) * 6; }
        return p;
    }
    function hslaToRgba(ref) {
        var hue = ref.hue;
        var saturation = ref.saturation;
        var lightness = ref.lightness;
        var alpha = ref.alpha;

        hue /= 360;
        saturation /= 100;
        lightness /= 100;
        var red = 0;
        var green = 0;
        var blue = 0;
        if (!saturation) {
            red = green = blue = lightness;
        }
        else {
            var q = lightness < 0.5
                ? lightness * (1 + saturation)
                : lightness + saturation - lightness * saturation;
            var p = 2 * lightness - q;
            red = hueToRgb(p, q, hue + 1 / 3);
            green = hueToRgb(p, q, hue);
            blue = hueToRgb(p, q, hue - 1 / 3);
        }
        return {
            red: Math.round(red * 255),
            green: Math.round(green * 255),
            blue: Math.round(blue * 255),
            alpha: alpha,
        };
    }

    var mixLinearColor = function (from, to, v) {
        var fromExpo = from * from;
        var toExpo = to * to;
        return Math.sqrt(Math.max(0, v * (toExpo - fromExpo) + fromExpo));
    };
    var colorTypes = [hex, rgba, hsla];
    var getColorType = function (v) { return colorTypes.find(function (type) { return type.test(v); }); };
    var notAnimatable = function (color) { return ("'" + color + "' is not an animatable color. Use the equivalent color code instead."); };
    var mixColor = function (from, to) {
        var fromColorType = getColorType(from);
        var toColorType = getColorType(to);
        invariant(!!fromColorType, notAnimatable(from));
        invariant(!!toColorType, notAnimatable(to));
        var fromColor = fromColorType.parse(from);
        var toColor = toColorType.parse(to);
        if (fromColorType === hsla) {
            fromColor = hslaToRgba(fromColor);
            fromColorType = rgba;
        }
        if (toColorType === hsla) {
            toColor = hslaToRgba(toColor);
            toColorType = rgba;
        }
        var blended = Object.assign({}, fromColor);
        return function (v) {
            for (var key in blended) {
                if (key !== "alpha") {
                    blended[key] = mixLinearColor(fromColor[key], toColor[key], v);
                }
            }
            blended.alpha = mix(fromColor.alpha, toColor.alpha, v);
            return fromColorType.transform(blended);
        };
    };

    var isNum = function (v) { return typeof v === 'number'; };

    var combineFunctions = function (a, b) { return function (v) { return b(a(v)); }; };
    var pipe = function () {
    	var transformers = [], len = arguments.length;
    	while ( len-- ) transformers[ len ] = arguments[ len ];

    	return transformers.reduce(combineFunctions);
    };

    function getMixer(origin, target) {
        if (isNum(origin)) {
            return function (v) { return mix(origin, target, v); };
        }
        else if (color.test(origin)) {
            return mixColor(origin, target);
        }
        else {
            return mixComplex(origin, target);
        }
    }
    var mixArray = function (from, to) {
        var output = [].concat( from );
        var numValues = output.length;
        var blendValue = from.map(function (fromThis, i) { return getMixer(fromThis, to[i]); });
        return function (v) {
            for (var i = 0; i < numValues; i++) {
                output[i] = blendValue[i](v);
            }
            return output;
        };
    };
    var mixObject = function (origin, target) {
        var output = Object.assign(Object.assign({}, origin), target);
        var blendValue = {};
        for (var key in output) {
            if (origin[key] !== undefined && target[key] !== undefined) {
                blendValue[key] = getMixer(origin[key], target[key]);
            }
        }
        return function (v) {
            for (var key in blendValue) {
                output[key] = blendValue[key](v);
            }
            return output;
        };
    };
    function analyse(value) {
        var parsed = complex.parse(value);
        var numValues = parsed.length;
        var numNumbers = 0;
        var numRGB = 0;
        var numHSL = 0;
        for (var i = 0; i < numValues; i++) {
            if (numNumbers || typeof parsed[i] === "number") {
                numNumbers++;
            }
            else {
                if (parsed[i].hue !== undefined) {
                    numHSL++;
                }
                else {
                    numRGB++;
                }
            }
        }
        return { parsed: parsed, numNumbers: numNumbers, numRGB: numRGB, numHSL: numHSL };
    }
    var mixComplex = function (origin, target) {
        var template = complex.createTransformer(target);
        var originStats = analyse(origin);
        var targetStats = analyse(target);
        var canInterpolate = originStats.numHSL === targetStats.numHSL &&
            originStats.numRGB === targetStats.numRGB &&
            originStats.numNumbers >= targetStats.numNumbers;
        if (canInterpolate) {
            return pipe(mixArray(originStats.parsed, targetStats.parsed), template);
        }
        else {
            warning(true, ("Complex values '" + origin + "' and '" + target + "' too different to mix. Ensure all colors are of the same type, and that each contains the same quantity of number and color values. Falling back to instant transition."));
            return function (p) { return ("" + (p > 0 ? target : origin)); };
        }
    };

    var mixNumber = function (from, to) { return function (p) { return mix(from, to, p); }; };
    function detectMixerFactory(v) {
        if (typeof v === 'number') {
            return mixNumber;
        }
        else if (typeof v === 'string') {
            if (color.test(v)) {
                return mixColor;
            }
            else {
                return mixComplex;
            }
        }
        else if (Array.isArray(v)) {
            return mixArray;
        }
        else if (typeof v === 'object') {
            return mixObject;
        }
    }
    function createMixers(output, ease, customMixer) {
        var mixers = [];
        var mixerFactory = customMixer || detectMixerFactory(output[0]);
        var numMixers = output.length - 1;
        for (var i = 0; i < numMixers; i++) {
            var mixer = mixerFactory(output[i], output[i + 1]);
            if (ease) {
                var easingFunction = Array.isArray(ease) ? ease[i] : ease;
                mixer = pipe(easingFunction, mixer);
            }
            mixers.push(mixer);
        }
        return mixers;
    }
    function fastInterpolate(ref, ref$1) {
        var from = ref[0];
        var to = ref[1];
        var mixer = ref$1[0];

        return function (v) { return mixer(progress(from, to, v)); };
    }
    function slowInterpolate(input, mixers) {
        var inputLength = input.length;
        var lastInputIndex = inputLength - 1;
        return function (v) {
            var mixerIndex = 0;
            var foundMixerIndex = false;
            if (v <= input[0]) {
                foundMixerIndex = true;
            }
            else if (v >= input[lastInputIndex]) {
                mixerIndex = lastInputIndex - 1;
                foundMixerIndex = true;
            }
            if (!foundMixerIndex) {
                var i = 1;
                for (; i < inputLength; i++) {
                    if (input[i] > v || i === lastInputIndex) {
                        break;
                    }
                }
                mixerIndex = i - 1;
            }
            var progressInRange = progress(input[mixerIndex], input[mixerIndex + 1], v);
            return mixers[mixerIndex](progressInRange);
        };
    }
    function interpolate(input, output, ref) {
        if ( ref === void 0 ) ref = {};
        var isClamp = ref.clamp; if ( isClamp === void 0 ) isClamp = true;
        var ease = ref.ease;
        var mixer = ref.mixer;

        var inputLength = input.length;
        invariant(inputLength === output.length, 'Both input and output ranges must be the same length');
        invariant(!ease || !Array.isArray(ease) || ease.length === inputLength - 1, 'Array of easing functions must be of length `input.length - 1`, as it applies to the transitions **between** the defined values.');
        if (input[0] > input[inputLength - 1]) {
            input = [].concat(input);
            output = [].concat(output);
            input.reverse();
            output.reverse();
        }
        var mixers = createMixers(output, ease, mixer);
        var interpolator = inputLength === 2
            ? fastInterpolate(input, mixers)
            : slowInterpolate(input, mixers);
        return isClamp
            ? function (v) { return interpolator(clamp$1(input[0], input[inputLength - 1], v)); }
            : interpolator;
    }

    var reverseEasing = function (easing) { return function (p) { return 1 - easing(1 - p); }; };
    var mirrorEasing = function (easing) { return function (p) { return p <= 0.5 ? easing(2 * p) / 2 : (2 - easing(2 * (1 - p))) / 2; }; };
    var createExpoIn = function (power) { return function (p) { return Math.pow(p, power); }; };
    var createBackIn = function (power) { return function (p) { return p * p * ((power + 1) * p - power); }; };
    var createAnticipate = function (power) {
        var backEasing = createBackIn(power);
        return function (p) { return (p *= 2) < 1
            ? 0.5 * backEasing(p)
            : 0.5 * (2 - Math.pow(2, -10 * (p - 1))); };
    };

    var DEFAULT_OVERSHOOT_STRENGTH = 1.525;
    var BOUNCE_FIRST_THRESHOLD = 4.0 / 11.0;
    var BOUNCE_SECOND_THRESHOLD = 8.0 / 11.0;
    var BOUNCE_THIRD_THRESHOLD = 9.0 / 10.0;
    var easeIn = createExpoIn(2);
    reverseEasing(easeIn);
    var easeInOut = mirrorEasing(easeIn);
    var circIn = function (p) { return 1 - Math.sin(Math.acos(p)); };
    var circOut = reverseEasing(circIn);
    mirrorEasing(circOut);
    var backIn = createBackIn(DEFAULT_OVERSHOOT_STRENGTH);
    reverseEasing(backIn);
    mirrorEasing(backIn);
    createAnticipate(DEFAULT_OVERSHOOT_STRENGTH);
    var ca = 4356.0 / 361.0;
    var cb = 35442.0 / 1805.0;
    var cc = 16061.0 / 1805.0;
    var bounceOut = function (p) {
        if (p === 1 || p === 0)
            { return p; }
        var p2 = p * p;
        return p < BOUNCE_FIRST_THRESHOLD
            ? 7.5625 * p2
            : p < BOUNCE_SECOND_THRESHOLD
                ? 9.075 * p2 - 9.9 * p + 3.4
                : p < BOUNCE_THIRD_THRESHOLD
                    ? ca * p2 - cb * p + cc
                    : 10.8 * p * p - 20.52 * p + 10.72;
    };
    reverseEasing(bounceOut);

    function defaultEasing(values, easing) {
        return values.map(function () { return easing || easeInOut; }).splice(0, values.length - 1);
    }
    function defaultOffset(values) {
        var numValues = values.length;
        return values.map(function (_value, i) { return i !== 0 ? i / (numValues - 1) : 0; });
    }
    function convertOffsetToTimes(offset, duration) {
        return offset.map(function (o) { return o * duration; });
    }
    function keyframes(ref) {
        var from = ref.from; if ( from === void 0 ) from = 0;
        var to = ref.to; if ( to === void 0 ) to = 1;
        var ease = ref.ease;
        var offset = ref.offset;
        var duration = ref.duration; if ( duration === void 0 ) duration = 300;

        var state = { done: false, value: from };
        var values = Array.isArray(to) ? to : [from, to];
        var times = convertOffsetToTimes(offset && offset.length === values.length
            ? offset
            : defaultOffset(values), duration);
        function createInterpolator() {
            return interpolate(times, values, {
                ease: Array.isArray(ease) ? ease : defaultEasing(values, ease),
            });
        }
        var interpolator = createInterpolator();
        return {
            next: function (t) {
                state.value = interpolator(t);
                state.done = t >= duration;
                return state;
            },
            flipTarget: function () {
                values.reverse();
                interpolator = createInterpolator();
            },
        };
    }

    function decay(ref) {
        var velocity = ref.velocity; if ( velocity === void 0 ) velocity = 0;
        var from = ref.from; if ( from === void 0 ) from = 0;
        var power = ref.power; if ( power === void 0 ) power = 0.8;
        var timeConstant = ref.timeConstant; if ( timeConstant === void 0 ) timeConstant = 350;
        var restDelta = ref.restDelta; if ( restDelta === void 0 ) restDelta = 0.5;
        var modifyTarget = ref.modifyTarget;

        var state = { done: false, value: from };
        var amplitude = power * velocity;
        var ideal = from + amplitude;
        var target = modifyTarget === undefined ? ideal : modifyTarget(ideal);
        if (target !== ideal)
            { amplitude = target - from; }
        return {
            next: function (t) {
                var delta = -amplitude * Math.exp(-t / timeConstant);
                state.done = !(delta > restDelta || delta < -restDelta);
                state.value = state.done ? target : target + delta;
                return state;
            },
            flipTarget: function () { },
        };
    }

    var types = { keyframes: keyframes, spring: spring, decay: decay };
    function detectAnimationFromOptions(config) {
        if (Array.isArray(config.to)) {
            return keyframes;
        }
        else if (types[config.type]) {
            return types[config.type];
        }
        var keys = new Set(Object.keys(config));
        if (keys.has("ease") ||
            (keys.has("duration") && !keys.has("dampingRatio"))) {
            return keyframes;
        }
        else if (keys.has("dampingRatio") ||
            keys.has("stiffness") ||
            keys.has("mass") ||
            keys.has("damping") ||
            keys.has("restSpeed") ||
            keys.has("restDelta")) {
            return spring;
        }
        return keyframes;
    }

    var defaultTimestep = (1 / 60) * 1000;
    var getCurrentTime = typeof performance !== "undefined"
        ? function () { return performance.now(); }
        : function () { return Date.now(); };
    var onNextFrame = typeof window !== "undefined"
        ? function (callback) { return window.requestAnimationFrame(callback); }
        : function (callback) { return setTimeout(function () { return callback(getCurrentTime()); }, defaultTimestep); };

    function createRenderStep(runNextFrame) {
        var toRun = [];
        var toRunNextFrame = [];
        var numToRun = 0;
        var isProcessing = false;
        var flushNextFrame = false;
        var toKeepAlive = new WeakSet();
        var step = {
            schedule: function (callback, keepAlive, immediate) {
                if ( keepAlive === void 0 ) keepAlive = false;
                if ( immediate === void 0 ) immediate = false;

                var addToCurrentFrame = immediate && isProcessing;
                var buffer = addToCurrentFrame ? toRun : toRunNextFrame;
                if (keepAlive)
                    { toKeepAlive.add(callback); }
                if (buffer.indexOf(callback) === -1) {
                    buffer.push(callback);
                    if (addToCurrentFrame && isProcessing)
                        { numToRun = toRun.length; }
                }
                return callback;
            },
            cancel: function (callback) {
                var index = toRunNextFrame.indexOf(callback);
                if (index !== -1)
                    { toRunNextFrame.splice(index, 1); }
                toKeepAlive.delete(callback);
            },
            process: function (frameData) {
                var assign;

                if (isProcessing) {
                    flushNextFrame = true;
                    return;
                }
                isProcessing = true;
                (assign = [toRunNextFrame, toRun], toRun = assign[0], toRunNextFrame = assign[1]);
                toRunNextFrame.length = 0;
                numToRun = toRun.length;
                if (numToRun) {
                    for (var i = 0; i < numToRun; i++) {
                        var callback = toRun[i];
                        callback(frameData);
                        if (toKeepAlive.has(callback)) {
                            step.schedule(callback);
                            runNextFrame();
                        }
                    }
                }
                isProcessing = false;
                if (flushNextFrame) {
                    flushNextFrame = false;
                    step.process(frameData);
                }
            },
        };
        return step;
    }

    var maxElapsed = 40;
    var useDefaultElapsed = true;
    var runNextFrame = false;
    var isProcessing = false;
    var frame = {
        delta: 0,
        timestamp: 0,
    };
    var stepsOrder = [
        "read",
        "update",
        "preRender",
        "render",
        "postRender" ];
    var steps = stepsOrder.reduce(function (acc, key) {
        acc[key] = createRenderStep(function () { return (runNextFrame = true); });
        return acc;
    }, {});
    var sync = stepsOrder.reduce(function (acc, key) {
        var step = steps[key];
        acc[key] = function (process, keepAlive, immediate) {
            if ( keepAlive === void 0 ) keepAlive = false;
            if ( immediate === void 0 ) immediate = false;

            if (!runNextFrame)
                { startLoop(); }
            return step.schedule(process, keepAlive, immediate);
        };
        return acc;
    }, {});
    var cancelSync = stepsOrder.reduce(function (acc, key) {
        acc[key] = steps[key].cancel;
        return acc;
    }, {});
    stepsOrder.reduce(function (acc, key) {
        acc[key] = function () { return steps[key].process(frame); };
        return acc;
    }, {});
    var processStep = function (stepId) { return steps[stepId].process(frame); };
    var processFrame = function (timestamp) {
        runNextFrame = false;
        frame.delta = useDefaultElapsed
            ? defaultTimestep
            : Math.max(Math.min(timestamp - frame.timestamp, maxElapsed), 1);
        frame.timestamp = timestamp;
        isProcessing = true;
        stepsOrder.forEach(processStep);
        isProcessing = false;
        if (runNextFrame) {
            useDefaultElapsed = false;
            onNextFrame(processFrame);
        }
    };
    var startLoop = function () {
        runNextFrame = true;
        useDefaultElapsed = true;
        if (!isProcessing)
            { onNextFrame(processFrame); }
    };

    function loopElapsed(elapsed, duration, delay) {
        if ( delay === void 0 ) delay = 0;

        return elapsed - duration - delay;
    }
    function reverseElapsed(elapsed, duration, delay, isForwardPlayback) {
        if ( delay === void 0 ) delay = 0;
        if ( isForwardPlayback === void 0 ) isForwardPlayback = true;

        return isForwardPlayback
            ? loopElapsed(duration + -elapsed, duration, delay)
            : duration - (elapsed - duration) + delay;
    }
    function hasRepeatDelayElapsed(elapsed, duration, delay, isForwardPlayback) {
        return isForwardPlayback ? elapsed >= duration + delay : elapsed <= -delay;
    }

    var framesync = function (update) {
        var passTimestamp = function (ref) {
            var delta = ref.delta;

            return update(delta);
        };
        return {
            start: function () { return sync.update(passTimestamp, true); },
            stop: function () { return cancelSync.update(passTimestamp); },
        };
    };
    function animate(_a) {
        var _b, _c;
        var from = _a.from;
        var autoplay = _a.autoplay; if ( autoplay === void 0 ) autoplay = true;
        var driver = _a.driver; if ( driver === void 0 ) driver = framesync;
        var elapsed = _a.elapsed; if ( elapsed === void 0 ) elapsed = 0;
        var repeatMax = _a.repeat; if ( repeatMax === void 0 ) repeatMax = 0;
        var repeatType = _a.repeatType; if ( repeatType === void 0 ) repeatType = "loop";
        var repeatDelay = _a.repeatDelay; if ( repeatDelay === void 0 ) repeatDelay = 0;
        var onPlay = _a.onPlay;
        var onStop = _a.onStop;
        var onComplete = _a.onComplete;
        var onRepeat = _a.onRepeat;
        var onUpdate = _a.onUpdate;
        var options = __rest(_a, ["from", "autoplay", "driver", "elapsed", "repeat", "repeatType", "repeatDelay", "onPlay", "onStop", "onComplete", "onRepeat", "onUpdate"]);
        var to = options.to;
        var driverControls;
        var repeatCount = 0;
        var computedDuration = options.duration;
        var latest;
        var isComplete = false;
        var isForwardPlayback = true;
        var interpolateFromNumber;
        var animator = detectAnimationFromOptions(options);
        if ((_c = (_b = animator).needsInterpolation) === null || _c === void 0 ? void 0 : _c.call(_b, from, to)) {
            interpolateFromNumber = interpolate([0, 100], [from, to], {
                clamp: false,
            });
            from = 0;
            to = 100;
        }
        var animation = animator(Object.assign(Object.assign({}, options), { from: from, to: to }));
        function repeat() {
            repeatCount++;
            if (repeatType === "reverse") {
                isForwardPlayback = repeatCount % 2 === 0;
                elapsed = reverseElapsed(elapsed, computedDuration, repeatDelay, isForwardPlayback);
            }
            else {
                elapsed = loopElapsed(elapsed, computedDuration, repeatDelay);
                if (repeatType === "mirror")
                    { animation.flipTarget(); }
            }
            isComplete = false;
            onRepeat && onRepeat();
        }
        function complete() {
            driverControls.stop();
            onComplete && onComplete();
        }
        function update(delta) {
            if (!isForwardPlayback)
                { delta = -delta; }
            elapsed += delta;
            if (!isComplete) {
                var state = animation.next(Math.max(0, elapsed));
                latest = state.value;
                if (interpolateFromNumber)
                    { latest = interpolateFromNumber(latest); }
                isComplete = isForwardPlayback ? state.done : elapsed <= 0;
            }
            onUpdate === null || onUpdate === void 0 ? void 0 : onUpdate(latest);
            if (isComplete) {
                if (repeatCount === 0)
                    { computedDuration !== null && computedDuration !== void 0 ? computedDuration : (computedDuration = elapsed); }
                if (repeatCount < repeatMax) {
                    hasRepeatDelayElapsed(elapsed, computedDuration, repeatDelay, isForwardPlayback) && repeat();
                }
                else {
                    complete();
                }
            }
        }
        function play() {
            onPlay === null || onPlay === void 0 ? void 0 : onPlay();
            driverControls = driver(update);
            driverControls.start();
        }
        autoplay && play();
        return {
            stop: function () {
                onStop === null || onStop === void 0 ? void 0 : onStop();
                driverControls.stop();
            },
        };
    }

    function docReady(fn) {
        // see if DOM is already available
        if (document.readyState === "complete" || document.readyState === "interactive") {
            // call on next available tick
            setTimeout(fn, 1);
        } else {
            document.addEventListener("DOMContentLoaded", fn);
        }
    }

    function init() {
        var mixer;
        var clock = new THREE.Clock();

        var canvasElm = document.querySelector('canvas.overlay');
        var scrollWidth = Math.max(
            document.body.clientWidth, document.documentElement.clientWidth
        );
        var scrollHeight = Math.max(
            document.body.scrollHeight, document.documentElement.scrollHeight,
            document.body.offsetHeight, document.documentElement.offsetHeight,
            document.body.clientHeight, document.documentElement.clientHeight
        );

        // Setup renderer.
        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(75, scrollWidth / scrollHeight, 0.1, 1000);
        camera.position.z = 800;


        var renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            canvas: canvasElm
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(scrollWidth, scrollHeight);

        // Setup scene core.

        var ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
        scene.add(ambientLight);

        var pointLight = new THREE.PointLight( 0xffffff, 0.5 );
        camera.add( pointLight );

        scene.add(camera);

        // Setup scene objects.
        var map = new THREE.TextureLoader().load('assets/page1_hq_building.png');
        map.anisotropy = 16;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        //map.minFilter = map.magFilter = THREE.LinearFilter;

        var material = new THREE.MeshPhongMaterial({ map: map, side: THREE.DoubleSide, transparent: true });
        var object = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 4, 4), material);
        var scale = 5.75;
        object.name = 'Building';
        object.scale.set(scale, scale, scale);
        var buildingPosition = -300;

        object.position.set(0, buildingPosition, 0);
        scene.add(object);

        var loader = new THREE.GLTFLoader();

        loader.load( 'assets/seagull.glb', function ( gltf ) {
            var model = gltf.scene;
            model.name = 'Seagull';
            model.scale.set( 150, 150, 150 );
            model.position.set( -10, 20, 0 );
            model.rotation.set( 0, Math.PI, 0 );
            window.scenoGraph.objects.seagull = model;

            scene.add( window.scenoGraph.objects.seagull );
            mixer = new THREE.AnimationMixer( window.scenoGraph.objects.seagull );
            mixer.clipAction( gltf.animations[ 9 ] ).play();
            animateScene();
            console.log(gltf);

        }, undefined, function ( error ) {

            console.error( error );

        } );

        // Begin animations.
        window.scenoGraph = {
            animations: {
                building: {
                    yPosition: buildingPosition,
                    tween: animate({
                        duration: 5000,
                        onUpdate: function (latest) { return window.scenoGraph.animations.building.yPosition = buildingPosition + latest; },
                        repeat: Infinity,
                        to: [2.5, -2.5, 0],
                    })
                }            
            },
            objects: {
                seagull: null,
            }
        };

        

        window.addEventListener( 'resize', onWindowResize );

        function onWindowResize() {
            var scrollWidth = Math.max(
                document.body.clientWidth, document.documentElement.clientWidth
            );

            var scrollHeight = Math.max(
                document.body.scrollHeight, document.documentElement.scrollHeight,
                document.body.offsetHeight, document.documentElement.offsetHeight,
                document.body.clientHeight, document.documentElement.clientHeight
            );

            camera.aspect = scrollWidth / scrollHeight;
            camera.updateProjectionMatrix();

            renderer.setSize( scrollWidth, scrollHeight );

        }

        function animateScene() {

            window.requestAnimationFrame(animateScene);

            var delta = clock.getDelta();

            mixer.update( delta );

            render();
        }

        function render() {

            var timer = Date.now() * 0.0001;

            camera.lookAt(scene.position);

            scene.traverse(function (object) {

                if (object.isMesh === true) {

                    object.position.y += Math.cos(timer) * 0.025;

                }

            });

            renderer.render(scene, camera);

        }

        console.log('The page successfully loaded!');
    }

    docReady(init);

})();
//# sourceMappingURL=main.js.map
