var User = require('../models/user');
var DonorDate = require('../models/donordate');
var passport = require('passport');
var jwt = require('jsonwebtoken');
var config = require('../../config/database');
var express = require('express');
var multer = require('multer');
var xlstojson = require("xls-to-json-lc");
var xlsxtojson = require("xlsx-to-json-lc");
var assert = require('assert');
var fs = require('fs');
var Donor = require('../models/donors');
var https = require('https');
var http = require('http');
var async = require("async");
var unique = require('array-unique');
module.exports = function (router) {

    var storage = multer.diskStorage({ //multers disk storage settings
        destination: function (req, file, cb) {
            cb(null, './uploads/')
        },
        filename: function (req, file, cb) {
            var datetimestamp = Date.now();
            cb(null, file.fieldname + '-' + datetimestamp + '.' + file.originalname.split('.')[file.originalname.split('.').length - 1])
        }
    });

    var upload = multer({ //multer settings
        storage: storage,
        fileFilter: function (req, file, callback) { //file filter
            if (['xls', 'xlsx'].indexOf(file.originalname.split('.')[file.originalname.split('.').length - 1]) === -1) {
                req.fileValidationError = "Wrong extension type";
                return callback(new Error('Wrong extension type'));
            }
            callback(null, true);
        }
    }).single('file');

    //user group middleware
    var adminCheck = function (user) {
        return function (req, res, next) {
            if (req.body && req.body.type == user)
                next();
            else
                res.status(401).send('Unauthorized');
        };
    };
   router.post('/adddonor',passport.authenticate('jwt',{
        session: false
        }),adminCheck('admin'),function (req, res,next) {
        var donor = new Donor();
        donor.first_name = req.body.first_name;
        donor.address_line1 = req.body.addr1;
        donor.address_line2 = req.body.addr2;
        donor.email = req.body.email;
        donor.last_name = req.body.last_name;
        donor.phone = req.body.phone;
        donor.location =req.body.location;
        donor.pincode =req.body.pincode;
        donor.gender =req.body.gender;
        donor.bloodgroup=req.body.bloodgroup;
        donor.status="NotConfirmed";
         var geocoder = require('geocoder'); 
         geocoder.geocode(donor.pincode,function ( err, data ) {
                                            if(err)
                                            {
                                                res.json({
                                                    success: false,
                                                    message: "Exist"
                                                });
                                            }
                                            else   
                                                {
                                                 donor.latitude = data.results[0].geometry.location.lat;
                                                 donor.longitude = data.results[0].geometry.location.lng;
                                                 console.log("error");
                                                        Donor.addDonor(donor, function (err, donor) {
                                                        if (err) {
                                                            if(donor.latitude==undefined)
                                                            {
                                                                res.json({
                                                                    success:false,
                                                                    message:"wrong latitude"
                                                                });
                                                            }
                                                            else
                                                            {
                                                            res.json({
                                                                success: false,
                                                                message: "Exist"
                                                            });
                                                            }
                                                        } else {
                                                            res.json({
                                                                success: true,
                                                                message: "Created"
                                                            });
                                                        }
                                                      });    
                                               }                        
        }); 
      
});   
    router.post('/register', function (req, res) {
        var user = new User();
        user.first_name = req.body.first_name;
        user.pwd = req.body.pwd;
        user.email = req.body.email;
        user.last_name = req.body.last_name;
        user.phone = req.body.phone;
        User.addUser(user, function (err, user) {
            if (err) {
                res.json({
                    success: false,
                    message: "Exist"
                });
            } else {
                res.json({
                    success: true,
                    message: "Created"
                });
            }
        });
    });

    router.post('/authenticate', function (req, res) {
        var email = req.body.email;
        var password = req.body.pwd;
        User.getUserbyUsername(email, function (err, user) {
            if (err) throw err;
            if (!user) {
                return res.json({
                    success: false,
                    msg: "User not found"
                })
            }
            User.comparePassword(password, user.pwd, function (err, isMatch) {
                if (err) throw err;
                if (isMatch) {
                    const token = jwt.sign(user, config.secret, {
                        expiresIn: 604800 //1 week

                    });
                    res.json({
                        success: true,
                        token: 'JWT ' + token,
                        user: {
                            id: user._id,
                            first_name: user.first_name,
                            email: user.email,
                            phone: user.phone,
                            type: user.type

                        }
                    });
                } else {
                    return res.json({
                        success: false,
                        msg: "Wrong password. Try again"
                    });
                }
            });
        });

    });

    router.get('/admindashboard', passport.authenticate('jwt', {
        session: false
    }), function (req, res, next) {
        res.json({
            user: req.user
        });

    });
    router.get('/excelconverter', passport.authenticate('jwt', {
        session: false
    }), function (req, res, next) {
        res.json({
            user: req.user
        });

    });
    router.get('/profile', passport.authenticate('jwt', {
        session: false
    }), function (req, res, next) {
        res.json({
            user: req.user
        });

    });

    /** API path that will upload the files */
    router.post('/upload', passport.authenticate('jwt', {
        session: false
    }), function (req, res) {
        var locObj = '';
        var exceltojson; //Initialization
        upload(req, res, function (err) {
            if (err) {
                res.json({
                    error_code: 1,
                    err_desc: req.fileValidationError
                });
                return;
            }
            /** Multer gives us file info in req.file object */
            if (!req.file) {
                res.json({
                    error_code: 1,
                    err_desc: "No file passed"
                });
                return;
            }
            //start convert process
            /** Check the extension of the incoming file and 
             *  use the appropriate module
             */
            if (req.file.originalname.split('.')[req.file.originalname.split('.').length - 1] === 'xlsx') {
                let count = 0;
                xlsxtojson({
                    input: req.file.path, //the same path where we uploaded our file
                    output: null, //since we don't need output.json
                }, function (err, result) {
                    if (err) {
                        return res.json({
                            error_code: 1,
                            err_desc: "Excel Sheet Corrupted",
                            data: null
                        });
                    }
                    if (result.length > 0 && result[0].phone != null && result[0].first_name != null && result[0].pincode != null) {
                        var donor = [];
                        var loc = [];
                        var k = 0;
                        var j = 0;
                        for (var i = 0; i < result.length; i++) {
                            if (result[i].first_name != "" && result[i].pincode != "" && result[i].gender != "" && result[i].bloodgroup != undefined && result[i].phone != "") {
                                donor[j] = new Donor();
                                donor[j].first_name = result[i].first_name;
                                donor[j].location = result[i].location;
                                donor[j].phone = result[i].phone;
                                donor[j].email = result[i].email;
                                donor[j].pincode = result[i].pincode;
                                donor[j].latitude = undefined;
                                donor[j].longitude = undefined;
                                var options = {
                                    host: 'maps.googleapis.com',
                                    path: '/maps/api/geocode/json?&address=' + donor[j].pincode + '&key=AIzaSyD4M1TkzIl0nyKObyXtrCOgHJpN_BDPb6A',
                                }
                                callback = function (response) {
                                    var str = '';

                                    //another chunk of data has been recieved, so append it to `str`
                                    response.on('data', function (chunk) {
                                        locObj += chunk;
                                    });

                                    //the whole response has been recieved, so we just print it out here
                                    response.on('end', function () {
                                        loc[k] = JSON.parse(locObj);
                                        donor[k].latitude = loc[k].results[0].geometry.location.lat;
                                        donor[k].longitude = loc[k].results[0].geometry.location.lng;
                                        locObj = "";
                                        k++;
                                        if (k == j) {
                                            if (donor.length != 0) {
                                                Donor.collection.insertMany(donor, {
                                                    ordered: false
                                                }, function (err, r) {
                                                    if (err) {
                                                        if (r.insertedCount == undefined) {
                                                            r.insertedCount = 0
                                                        }
                                                        res.json({
                                                            error_code: 1,
                                                            err_desc: r.insertedCount + " out of " + result.length + " are added to the database from",
                                                            data: result
                                                        });
                                                    } else {
                                                        res.json({
                                                            error_code: 0,
                                                            err_desc: null,
                                                            data: result
                                                        });
                                                    }

                                                });
                                            } else {
                                                res.json({
                                                    error_code: 1,
                                                    err_desc: "Incomplete data in",
                                                    data: result
                                                });
                                            }

                                        }

                                    });
                                }
                                https.request(options, callback).end();
                                donor[j].last_name = result[i].last_name;
                                donor[j].gender = result[i].gender;
                                donor[j].location = result[i].location;
                                donor[j].address_line1 = result[i].address_line1;
                                donor[j].address_line2 = result[i].address_line2;
                                donor[j].status = "NotConfirmed";
                                donor[j].bloodgroup = result[i].bloodgroup;
                                j++;

                            }
                        }
                    } else {
                        res.json({
                            error_code: 1,
                            err_desc: "No data in ",
                            data: result
                        });
                    }
                });
                try {
                    fs.unlinkSync(req.file.path);
                } catch (e) {
                    console.log(req.file + " not deleted");
                }
            } else {
                xlstojson({
                    input: req.file.path, //the same path where we uploaded our file
                    output: null, //since we don't need output.json
                }, function (err, result) {
                    if (err) {
                        return res.json({
                            error_code: 1,
                            err_desc: "Excel Sheet Corrupted",
                            data: null
                        });
                    }
                    if (result.length > 0 && result[0].phone != null && result[0].first_name != null && result[0].pincode != null) {
                        var donor = [];
                        var loc = [];
                        var k = 0;
                        var j = 0;
                        for (var i = 0; i < result.length; i++) {
                            if (result[i].first_name != "" && result[i].pincode != "" && result[i].gender != "" && result[i].bloodgroup != undefined && result[i].phone != "") {
                                donor[j] = new Donor();
                                donor[j].first_name = result[i].first_name;
                                donor[j].phone = result[i].phone;
                                donor[j].location = result[i].location;
                                donor[j].email = result[i].email;
                                donor[j].pincode = result[i].pincode;
                                donor[j].latitude = undefined;
                                donor[j].longitude = undefined;
                                var options = {
                                    host: 'maps.googleapis.com',
                                    path: '/maps/api/geocode/json?&address=' + donor[j].pincode + '&key=AIzaSyD4M1TkzIl0nyKObyXtrCOgHJpN_BDPb6A'
                                }
                                callback = function (response) {
                                    var str = '';

                                    //another chunk of data has been recieved, so append it to `str`
                                    response.on('data', function (chunk) {
                                        locObj += chunk;
                                    });

                                    //the whole response has been recieved, so we just print it out here
                                    response.on('end', function () {
                                        loc[k] = JSON.parse(locObj);
                                        donor[k].latitude = loc[k].results[0].geometry.location.lat;
                                        donor[k].longitude = loc[k].results[0].geometry.location.lng;
                                        locObj = "";
                                        k++;
                                        if (k == j) {
                                            if (donor.length != 0) {
                                                Donor.collection.insertMany(donor, {
                                                    ordered: false
                                                }, function (err, r) {
                                                    if (err) {
                                                        if (r.insertedCount == undefined) {
                                                            r.insertedCount = 0
                                                        }
                                                        res.json({
                                                            error_code: 1,
                                                            err_desc: r.insertedCount + " out of " + result.length + " are added to the database from",
                                                            data: result
                                                        });
                                                    } else {
                                                        res.json({
                                                            error_code: 0,
                                                            err_desc: null,
                                                            data: result
                                                        });
                                                    }

                                                });
                                            } else {
                                                res.json({
                                                    error_code: 1,
                                                    err_desc: "Incomplete data in",
                                                    data: result
                                                });
                                            }

                                        }

                                    });
                                }
                                https.request(options, callback).end();
                                donor[j].last_name = result[i].last_name;
                                donor[j].gender = result[i].gender;
                                donor[j].address_line1 = result[i].address_line1;
                                donor[j].address_line2 = result[i].address_line2;
                                donor[j].status = "NotConfirmed";
                                donor[j].bloodgroup = result[i].bloodgroup;
                                j++;

                            }
                        }
                    } else {
                        res.json({
                            error_code: 1,
                            err_desc: "No data in ",
                            data: result
                        });
                    }
                });
                try {
                    fs.unlinkSync(req.file.path);
                } catch (e) {
                    console.log("Files not deleted");
                }
            }


        });
    });
    //Location for search bar
    router.get('/locations', function (req, res, next) {
        Donor.getLocations(function (err, location) {
            if (err) {
                return res.json({
                    err_desc: "Something went wrong"
                });
            } else {
                var loc =[];
                for(var i = 0;i<location.length;i++){
                    loc[i]=location[i].location;
                }
                loc = unique(loc);
                res.json({
                    location: loc
                })
            }
        });
    });

    //donor retrieval with approved status
     router.post('/returndonors',passport.authenticate('jwt',{
        session: false
    }),adminCheck('admin'),function (req, res) {
              Donor.searchByStatus("NotConfirmed", function (err, data) {
                   if (err) {
                return res.json({
                    err_desc: "Something went wrong"
                });
             }
             else if (data.length == 0) {
                
                return res.json({
                    success: false,
                    data: "none"
                })
            }
            else
            {
                console.log("Correct");
                 res.json({
                                    success: true,
                                    data: data
                                })
            }
        });
        });

    router.post('/sms', function (req, res, next) {
        console.log(req.body.phone)
        var options = {
            "method": "GET",
            "hostname": "2factor.in",
            "port": null,
            "path": "/API/V1/a8a21c70-29da-11e7-929b-00163ef91450/SMS/"+req.body.phone+"/AUTOGEN/ABCDEFjnjnjnjjnj",
            "headers": {}
        };
        smsapi = function(response){
            var result = '';
            response.on('data',function(chunk){
                result+=chunk;
            });
            response.on('end', function(){
                result = JSON.parse(result);
                res.json(result)
            })
        }
       https.request(options, smsapi).end();
                   
        
    })

    //Search Engine
    router.post('/search', function (req, res, next) {
        location = req.body.loc;
        bgroup = req.body.bgroup;
        var selecteddonors = [];
        var donordistance = [];
        Donor.searchByBgroup(bgroup, function (err, data) {
        
            if (err) {
                return res.json({
                    err_desc: "Something went wrong"
                });
            } else if (data.length == 0) {

                return res.json({
                    success: false,
                    data: "none",
                    distance: 0
                })
            } else {

                var k = 0;
                var i = 0;
                async.eachSeries(data, function (item, callback) {
                    var options = {
                        host: 'maps.googleapis.com',
                        path: 'https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=' + location + '&destinations=' + item.latitude + ',' + item.longitude + '&key=AIzaSyD4M1TkzIl0nyKObyXtrCOgHJpN_BDPb6A',
                    }
                    distanceapi = function (response) {

                        var result = '';
                        response.on('data', function (chunk) {
                            result += chunk;
                        });
                        response.on('end', function () {

                            result = JSON.parse(result);
                            distance = result.rows[0].elements[0].distance.text;
                            if(distance[distance.length-1]=="m"&&distance[distance.length-2]=="k"){
                                distance = distance.replace(/ km/, '');
                            }
                            else {
                                distance = distance.replace(/ m/, '');
                                distance = 1
                            }
                            console.log(distance)
                            
                            i++;
                            if (distance < 190) {
                                selecteddonors[k] = item;
                                donordistance[k] = distance;
                                k++;
                            }

                            if (i == data.length) {


                                res.json({
                                    success: true,
                                    data: selecteddonors,
                                    distance: donordistance
                                })


                            }

                        });

                    }
                    https.request(options, distanceapi).end();
                    callback();

                }, function (err) {
                    if (err) {
                        console.log(err);
                    }

                });
            }
        })
    })

    return router;
}