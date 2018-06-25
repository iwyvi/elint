'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const execa = require('execa');
const { version } = require('../../package.json');

const mocha = require('mocha');
const chai = require('chai');
chai.should();

function run(command, cwd) {
  const strs = command.match(/(?:[^\s"]+|"[^"]*")+/g);
  let program = strs[0];
  const argus = strs.slice(1).map(s => {
    if (/^".+"$/.test(s)) {
      return s.slice(1, -1);
    }

    return s;
  });

  if (process.platform === 'win32' && program === 'node') {
    program = 'cmd';
    argus.unshift('/d /s /c');
  }

  console.log(`run: ${program} ${argus.join(' ')}, in ${cwd}`);
  execa.sync(program, argus, {
    stdio: 'inherit',
    cwd
  });
}

let elintPath = path.join(__dirname, '../../');
let elintPkgPath = path.join(elintPath, `elint-${version}.tgz`);

let presetPath = path.join(__dirname, 'test-preset');
let presetPkgPath = path.join(presetPath, 'elint-preset-system-test-1.0.0.tgz');

// elint 打包
run('npm pack', elintPath);

// preset 打包
run('npm pack', presetPath);

/**
 * 测试前执行 npm check
 */
require('./npm-check');

// 系统测试
describe('系统测试', function () {
  // ci 有时不太稳定，添加 try
  if (process.env.CI) {
    this.retries(2);
  }

  // timeout 5min
  this.timeout(5 * 60 * 1000);

  // 临时目录
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `elint_test_system_${Date.now()}`);
    const testProjectDir = path.join(__dirname, 'test-project');

    // 创建测试项目
    fs.copySync(testProjectDir, tempDir);

    /**
     * moch env.js baseDir
     */
    process.env.INIT_CWD = tempDir;
  });

  // 清理
  afterEach(() => {
    fs.removeSync(tempDir);
  });

  describe('安装', function () {
    let elintrcPath;
    let elintignorePath;
    let stylelintrcPath;
    let stylelintignorePath;
    let huskyrcPath;
    let commitlintrcPath;

    beforeEach(() => {
      elintrcPath = path.join(tempDir, '.eslintrc.js');
      elintignorePath = path.join(tempDir, '.eslintignore');
      stylelintrcPath = path.join(tempDir, '.stylelintrc.js');
      stylelintignorePath = path.join(tempDir, '.stylelintignore');
      huskyrcPath = path.join(tempDir, '.huskyrc.js');
      commitlintrcPath = path.join(tempDir, '.commitlintrc.js');
    });

    function expect() {
      fs.existsSync(elintrcPath).should.be.equal(true);
      fs.existsSync(elintignorePath).should.be.equal(true);
      fs.existsSync(stylelintrcPath).should.be.equal(true);
      fs.existsSync(stylelintignorePath).should.be.equal(true);
      fs.existsSync(huskyrcPath).should.be.equal(true);
      fs.existsSync(commitlintrcPath).should.be.equal(true);
    }

    it('先安装 elint，再安装 preset', function () {
      run(`npm install ${elintPkgPath}`, tempDir);
      run(`npm install ${presetPkgPath}`, tempDir);

      expect();
    });

    it('先安装 preset，再安装 elint', function () {
      run(`npm install ${presetPkgPath}`, tempDir);
      run(`npm install ${elintPkgPath}`, tempDir);

      expect();
    });

    it('同时安装', function () {
      run(`npm install ${presetPkgPath} ${elintPkgPath}`, tempDir);

      expect();
    });

    it('先安装 elint，然后使用 elint 安装 preset', function () {
      // 这里使用 npm 上的包进行测试
      run(`npm install ${elintPkgPath}`, tempDir);
      run(`node node_modules${path.sep}.bin${path.sep}elint install test`, tempDir);

      fs.existsSync(elintrcPath).should.be.equal(true);
      fs.existsSync(stylelintrcPath).should.be.equal(true);
      fs.existsSync(huskyrcPath).should.be.equal(true);
      fs.existsSync(commitlintrcPath).should.be.equal(true);
    });
  });

  describe('功能测试', function () {
    beforeEach(() => {
      run(`npm install ${presetPkgPath} ${elintPkgPath}`, tempDir);
    });

    it('lint', function () {
      (function () {
        run('npm run lint-without-fix', tempDir);
      }).should.throw();
    });

    it('lint --fix', function () {
      run('npm run lint-fix', tempDir);
    });

    it('lint --no-ignore', function () {
      (function () {
        run('npm run lint-no-ignore', tempDir);
      }).should.throw();
    });

    it('lint es', function () {
      (function () {
        run('npm run lint-es-without-fix', tempDir);
      }).should.throw();
    });

    it('lint es --fix', function () {
      run('npm run lint-es-fix', tempDir);
    });

    it('lint style', function () {
      (function () {
        run('npm run lint-style-without-fix', tempDir);
      }).should.throw();
    });

    it('lint style --fix', function () {
      run('npm run lint-style-fix', tempDir);
    });

    it('version', function () {
      run('npm run version', tempDir);
    });

    it('diff 存在差异文件', function () {
      const elintrcPath = path.join(tempDir, '.eslintrc.js');
      const elintrcOldPath = path.join(tempDir, '.eslintrc.old.js');

      fs.copySync(elintrcPath, elintrcOldPath);
      fs.appendFileSync(elintrcOldPath, 'console.log(1)');

      run('npm run diff', tempDir);
    });

    it('diff 不存在差异文件', function () {
      run('npm run diff', tempDir);
    });

    it('直接执行 elint，显示 help', function () {
      run(`node node_modules${path.sep}.bin${path.sep}elint`, tempDir);
    });
  });

  describe('git 相关测试', function () {
    let hooksPath;

    beforeEach(() => {
      run('git init', tempDir);
      run('git config user.name "zhang san"', tempDir);
      run('git config user.email "zhangsan@gmail.com"', tempDir);
      run(`npm install ${presetPkgPath} ${elintPkgPath}`, tempDir);
      hooksPath = path.join(tempDir, '.git/hooks');
    });

    it('hooks install && uninstall', function () {
      let hooks;

      run('npm run hooks-uninstall', tempDir);

      // eslint-disable-next-line max-nested-callbacks
      hooks = fs.readdirSync(hooksPath).filter(p => !p.includes('.sample'));
      hooks.length.should.be.equal(0);

      run('npm run hooks-install', tempDir);

      // eslint-disable-next-line max-nested-callbacks
      hooks = fs.readdirSync(hooksPath).filter(p => !p.includes('.sample'));
      hooks.length.should.be.above(0);
    });

    it('lint commit(error)', function () {
      /**
       * 这里需要手动安装一次，因为 husky 的 postinstall 检查是 ci 环境，不执行安装
       * 手动安装的时候，已经有了配置文件，配置文件 skipCI = false
       */
      run('npm run hooks-install', tempDir);
      run('git add package.json', tempDir);

      (function () {
        run('git commit -m "hello"', tempDir);
      }).should.throw();
    });

    it('lint commit(success)', function () {
      /**
       * 这里需要手动安装一次，因为 husky 的 postinstall 检查是 ci 环境，不执行安装
       * 手动安装的时候，已经有了配置文件，配置文件 skipCI = false
       */
      run('npm run hooks-install', tempDir);
      run('git add package.json', tempDir);
      run('git commit -m "build: hello"', tempDir);
    });
  });
});
