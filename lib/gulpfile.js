var gulp = require('gulp');
var path = require('path');
var cwd = process.cwd();
var pkg = require(path.join(cwd, 'package.json'));
var shelljs = require('shelljs');
var jsx2example = require('gulp-jsx2example');
var ghHistory = require('gh-history');
var runCmd = require('./util').runCmd;
var fs = require('fs-extra');
var argv = require('minimist')(process.argv.slice(2));
var insert = require('gulp-insert');
var internalIp = require('internal-ip');
var rnPackager = require('rn-packager');
var through2 = require('through2');

gulp.task('lint', ['check-deps'], function (done) {
  var eslintBin = require.resolve('eslint/bin/eslint');
  var eslintConfig = path.join(__dirname, './eslintrc');
  var projectEslint = path.join(cwd, './.eslintrc');
  if (fs.existsSync(projectEslint)) {
    eslintConfig = projectEslint;
  }
  var args = [eslintBin, '-c', eslintConfig, '--ext', '.js,.jsx', 'src', 'tests', 'examples'];
  runCmd('node', args, done);
});

function cleanCompile() {
  shelljs.rm('-rf', path.join(cwd, 'lib'));
}

function cleanBuild() {
  shelljs.rm('-rf', path.join(cwd, 'build'));
}

function clean() {
  cleanCompile();
  cleanBuild();
}

gulp.task('clean', clean);

gulp.task('cleanCompile', cleanCompile);

gulp.task('cleanBuild', cleanBuild);

gulp.task('gh-pages', ['build'], function (done) {
  console.log('gh-paging');
  if (pkg.scripts['pre-gh-pages']) {
    shelljs.exec('npm run pre-gh-pages');
  }
  if (fs.existsSync(path.join(cwd, './examples/'))) {
    var ghPages = require('gh-pages');
    ghPages.publish(path.join(cwd, 'build'), {
      depth: 1,
      logger: function (message) {
        console.log(message);
      },
    }, function () {
      cleanBuild();
      console.log('gh-paged');
      done();
    });
  } else {
    done();
  }
});

// 对RN做编译
gulp.task('rn-build', function() {
  if (/^rn-/.test(pkg.name)) {
    return gulp
        .src([path.join(cwd, './examples/') + '*.js'])
        .pipe(through2.obj(function(file, enc, cb) {
          var extName = path.extname(file.path);
          var basename = path.basename(file.path, extName);
          var dirname = path.dirname(file.path);
          rnPackager.bundle({
            '--entry-file': file.path,
            '--bundle-output': dirname + '/' + basename + '.ios.bundle',
            '--platform': 'ios',
          }).done(function(){
            rnPackager.bundle({
              '--entry-file': file.path,
              '--bundle-output': dirname + '/' + basename + '.android.bundle',
              '--platform': 'android',
            }).done(cb);
          });
        }));
  }
});

gulp.task('build', ['rn-build'], function () {
  if (fs.existsSync(path.join(cwd, './examples/'))) {
    return gulp
      .src([path.join(cwd, './examples/') + '*.*'])
      .pipe(jsx2example({
        dest: 'build/examples/',
      }))
      .pipe(insert.transform(function(contents, file) {
        if (/<div class="example" id="__react-content"><\/div>/.test(contents)) {
          var pathArr = file.path.split('/');
          var addr = '//' + internalIp() + ':' + pkg.config.port + '/build/examples/' + pathArr[pathArr.length - 1];
          var newCts = '<div class="example" id="__react-content"><\/div>' +
            '<script src="https://os.alipayobjects.com/rmsportal/NrsdrrVhDIJnPUm.js"></script>' +
            '<script>document.getElementById("__react-content").innerHTML=\'<table style="width:100%;text-align:center"><tr><th>iOS</th><th>Android</th></tr><tr><td id="qr-ios"></td><td id="qr-android"></td></tr></table>\';' +
            'document.getElementById("qr-ios").appendChild(new AraleQRCode({text: ' +
              'location.hostname === "react-component.github.io" ? location.href.match(/(.+\\.)(\\w+)$/)[1] + "ios.bundle" : location.protocol + "' +
              addr.match(/(.+\.)(\w+)$/)[1] + 'ios.bundle' +
            '"}));' +
            'document.getElementById("qr-android").appendChild(new AraleQRCode({text: ' +
              'location.hostname === "react-component.github.io" ? location.href.match(/(.+\\.)(\\w+)$/)[1] + "android.bundle" : location.protocol + "' +
              addr.match(/(.+\.)(\w+)$/)[1] + 'android.bundle' +
            '"}))</script>';
          var fileNameArr = pathArr[pathArr.length - 1].split('.');
          fileNameArr.pop();
          return contents.replace('<div class="example" id="__react-content"></div>', newCts)
            .replace('<script src="common.js?nowrap"></script>', '')
            .replace('<script src="' + fileNameArr.join('.') + '.js?nowrap"></script>', '');
        }
        return contents;
      }))
      .pipe(gulp.dest('build/examples/'))
      .on('end', function () {
        shelljs.rm(path.join(cwd, './examples/') + '*.bundle');
      });
  }
});

gulp.task('pub', ['publish', 'gh-pages'], function () {
  console.log('tagging');
  var version = pkg.version;
  shelljs.cd(cwd);
  shelljs.exec('git tag ' + version);
  shelljs.exec('git push origin ' + version + ':' + version);
  shelljs.exec('git push origin master:master');
  console.log('tagged');
});

gulp.task('history', function (done) {
  var repository = pkg.repository.url;
  var info = repository.match(/git@github.com:([^/]+)\/([^.]+).git/);
  if (info && info.length) {
    ghHistory.generateHistoryMD({
      user: info[1],
      repo: info[2],
      mdFilePath: './HISTORY.md',
    }, function () {
      done();
    });
  }
});

gulp.task('check-deps', function (done) {
  require('./checkDep')(done);
});

gulp.task('publish', function () {
  console.log('publishing');
  var npm = argv.tnpm ? 'tnpm' : 'npm';
  shelljs.exec(npm + ' publish');
  cleanCompile();
  console.log('published');
  if (npm === 'npm') {
    var cnpm = shelljs.which('cnpm');
    if (cnpm) {
      shelljs.exec('cnpm sync');
    }
  }
});

gulp.task('compile_watch', function () {
  console.log('file changed');
});

gulp.task('watch', ['compile_watch'], function () {
  gulp.watch([
    'src/**/*.js?(x)',
  ], ['compile_watch']);
});
