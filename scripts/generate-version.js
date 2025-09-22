const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitInfo() {
  try {
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const shortCommit = commit.substring(0, 8);
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const isDirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim().length > 0;
    
    return {
      commit,
      shortCommit,
      branch,
      isDirty
    };
  } catch (error) {
    console.warn('Git information not available:', error.message);
    return {
      commit: 'unknown',
      shortCommit: 'unknown',
      branch: 'unknown',
      isDirty: false
    };
  }
}

function generateVersionInfo() {
  const packageJson = require('../package.json');
  const gitInfo = getGitInfo();
  const buildTime = new Date().toISOString();
  const nodeVersion = process.version;
  
  // Generate build number from timestamp (YYYYMMDD.HHMMSS format)
  const now = new Date();
  const buildNumber = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '.',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('');

  const versionInfo = {
    version: packageJson.version,
    buildNumber,
    buildTime,
    commit: gitInfo.commit,
    shortCommit: gitInfo.shortCommit,
    branch: gitInfo.branch,
    isDirty: gitInfo.isDirty,
    nodeVersion,
    appName: 'LamassuIoT Dashboard'
  };

  return versionInfo;
}

function writeVersionFile(versionInfo) {
  const versionFileContent = `// This file is auto-generated during build
// Do not edit manually - changes will be overwritten

export interface VersionInfo {
  version: string;
  buildNumber: string;
  buildTime: string;
  commit: string;
  shortCommit: string;
  branch: string;
  isDirty: boolean;
  nodeVersion: string;
  appName: string;
}

export const VERSION_INFO: VersionInfo = ${JSON.stringify(versionInfo, null, 2)};

export const APP_VERSION = "${versionInfo.version}";
export const BUILD_NUMBER = "${versionInfo.buildNumber}";
export const BUILD_TIME = "${versionInfo.buildTime}";
export const GIT_COMMIT = "${versionInfo.shortCommit}";
export const IS_DIRTY_BUILD = ${versionInfo.isDirty};
`;

  const outputPath = path.join(__dirname, '../src/lib/version.ts');
  fs.writeFileSync(outputPath, versionFileContent);
  
  console.log('✅ Version file generated:', outputPath);
  console.log('📦 Version:', versionInfo.version);
  console.log('🔢 Build:', versionInfo.buildNumber);
  console.log('📅 Build Time:', versionInfo.buildTime);
  console.log('🌿 Branch:', versionInfo.branch);
  console.log('📝 Commit:', versionInfo.shortCommit);
}

// Main execution
const versionInfo = generateVersionInfo();
writeVersionFile(versionInfo);

// Also write version info to a JSON file for Docker builds
const jsonOutputPath = path.join(__dirname, '../version.json');
fs.writeFileSync(jsonOutputPath, JSON.stringify(versionInfo, null, 2));
console.log('📄 Version JSON created:', jsonOutputPath);