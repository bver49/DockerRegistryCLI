var axios = require('axios');
var chalk = require('chalk');
var inquirer = require('inquirer');
var registryApi = '';
var token = '';
var user = '';
var pw = '';
var backupAmt = 2;

var api = axios.create({
  baseURL: registryApi,
  headers: {
    'Accept': 'application/vnd.docker.distribution.manifest.v2+json',
    'cache-control': 'no-cache'
  }
});

var api2 = axios.create({
  baseURL: registryApi,
  headers: {
    'Accept': 'application/vnd.docker.distribution.manifest.v2',
    'cache-control': 'no-cache'
  }
});

function testConnect() {
  return api.get('/_catalog');
}

function getAllImage() {
  return new Promise(function(resolve, reject) {
    api.get('/_catalog').then(function(response) {
      var repos = response.data.repositories;
      var getAllImageTag = Promise.all(repos.map(getTag));
      return getAllImageTag;
    }).then(function(response) {
      resolve(response.map(function(image) {
        return {
          name: image.data.name,
          tags: image.data.tags
        }
      }));
    }).catch(function(err) {
      reject(err);
    });
  });
}

function getTag(name) {
  return api.get(`/${name}/tags/list`);
}

function deleteImage(image) {
  var name = image.split(':')[0];
  var tag = image.split(':')[1];
  return new Promise(function(resolve, reject) {
    getDigest(image).then(function(response) {
      var digest = response.headers['docker-content-digest'];
      return api.delete(`/${name}/manifests/${digest}`)
    }).then(function(response) {
      console.log(chalk.green(`Success : Delete image ${name}:${tag} !`));
      resolve('ok');
    }).catch(function(err) {
      reject(err);
    });
  });
}

function getDigest(image) {
  var name = image.split(':')[0];
  var tag = image.split(':')[1];
  return api.get(`/${name}/manifests/${tag}`);
}

function getCreatedTime(image) {
  var name = image.split(':')[0];
  var tag = image.split(':')[1];
  return api2.get(`/${name}/manifests/${tag}`);
}

function getOldImage(imageList) {
  return new Promise(function(resolve, reject) {
    var unOrderImage = [];
    var oldImageObj = {}
    var oldImageList = [];
    imageList.map(function(image) {
      if (image.tags != null && image.tags.length > backupAmt) {
        image.tags.map(function(tag) {
          unOrderImage.push(`${image.name}:${tag}`);
        });
      }
    });
    var getImageCreatedTime = Promise.all(unOrderImage.map(getCreatedTime));
    getImageCreatedTime.then(function(result) {
      for (var i in result) {
        if (result[i].data.tag != 'latest') {
          if (oldImageObj[result[i].data.name]) {
            oldImageObj[result[i].data.name].push({
              name: result[i].data.name,
              tag: result[i].data.tag,
              time: JSON.parse(result[i].data.history[0].v1Compatibility).created
            });
          } else {
            oldImageObj[result[i].data.name] = [{
              name: result[i].data.name,
              tag: result[i].data.tag,
              time: JSON.parse(result[i].data.history[0].v1Compatibility).created
            }]
          }
        }
      }
      for (var i in oldImageObj) {
        oldImageObj[i] = oldImageObj[i].sort(function(imagea, imageb) {
          return new Date(imagea.time).getTime() - new Date(imageb.time).getTime();
        });
        for (var j = 0; j < oldImageObj[i].length - 1; j++) {
          oldImageList.push(`${oldImageObj[i][j].name}:${oldImageObj[i][j].tag}`);
        }
      }
      resolve(oldImageList);
    });
  });
}

function showAllImage() {
  getAllImage().then(function(imageList) {
    for (var i in imageList) {
      if (imageList[i].tags != null) {
        if (imageList[i].tags.length == 2 && imageList[i].tags.indexOf('latest') != -1) {
          console.log(chalk.blue(`${imageList[i].name}:${imageList[i].tags[1-imageList[i].tags.indexOf('latest')]}`));
        } else if (imageList[i].tags.length >= 2) {
          for (var j in imageList[i].tags) {
            if (imageList[i].tags[j] != 'latest') 
            console.log(chalk.blue(`${imageList[i].name}:${imageList[i].tags[j]}`));
          }
        } else {
          console.log(chalk.blue(`${imageList[i].name}:${imageList[i].tags[0]}`));
        }
      }
    }
  });
}

function showDeleteOption() {
  getAllImage().then(function(imageList) {
    chooseImage[0].choices = [];
    for (var i in imageList) {
      if (imageList[i].tags != null) {
        if (imageList[i].tags.length == 2 && imageList[i].tags.indexOf('latest') != -1) {
          chooseImage[0].choices.push(`${imageList[i].name}:${imageList[i].tags[1-imageList[i].tags.indexOf('latest')]}`);
        } else if (imageList[i].tags.length >= 2) {
          for (var j in imageList[i].tags) {
            if (imageList[i].tags[j] != 'latest')
              chooseImage[0].choices.push(`${imageList[i].name}:${imageList[i].tags[j]}`);
          }
        } else {
          chooseImage[0].choices.push(`${imageList[i].name}:${imageList[i].tags[0]}`);
        }
      }
    }
    inquirer.prompt(chooseImage).then(function(answer) {
      var deleteAllImage = Promise.all(answer.image.map(deleteImage));
      deleteAllImage.then(function(result) {
        console.log(chalk.green('選擇的Image已經刪除完畢!'));
      });
    });
  });
}

function cleanRegistry() {
  getAllImage().then(function(imageList) {
    getOldImage(imageList).then(function(oldImageList) {
      var deleteAllImage = Promise.all(oldImageList.map(deleteImage));
      deleteAllImage.then(function(result) {
        console.log(chalk.green('\nRegistry 已經清理完畢!'));
        console.log(chalk.green('\n被刪除的Image:'));
        for (var i in oldImageList) {
          console.log(chalk.green(oldImageList[i]));
        }
        console.log(chalk.green('\n現有的Image:'));
        showAllImage();
      });
    });
  });
}

var inputUser = [{
  type: 'input',
  name: 'user',
  message: '請輸入Registry帳號',
}]

var inputPw = [{
  type: 'password',
  name: 'pw',
  message: '請輸入Registry密碼'
}]

var chooseFn = [{
  type: 'list',
  name: 'function',
  message: '選擇功能',
  choices: ['列出所有Image', '刪除Image', '清理Registry']
}]

var chooseImage = [{
  type: 'checkbox',
  name: 'image',
  message: '選擇要刪除的Image'
}]

inquirer.prompt(inputUser).then(function(answer) {
  user = answer.user;
  inquirer.prompt(inputPw).then(function(answer) {
    pw = answer.pw;
    token = 'Basic ' + new Buffer(`${user}:${pw}`).toString('base64');
    api.defaults.headers['Authorization'] = token;
    api2.defaults.headers['Authorization'] = token;
    testConnect().then(function() {
      console.log('驗證成功!');
      inquirer.prompt(chooseFn).then(function(answer) {
        switch (answer.function) {
          case '列出所有Image':
            showAllImage();
            break;
          case '刪除Image':
            showDeleteOption();
            break;
          case '清理Registry':
            cleanRegistry();
            break;
        }
      });
    }).catch(function(err) {
      console.log('驗證失敗!');
    })
  });
});
