/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

/*::
import type {WorkerMessage, WorkerMetadata} from './flow-types';
*/

'use strict';

const dependencyExtractor = require('./lib/dependencyExtractor');
const excludedExtensions = require('./workerExclusionList');
const {createHash} = require('crypto');
const fs = require('graceful-fs');
const path = require('path');

const PACKAGE_JSON = path.sep + 'package.json';

let hasteImpl /*: ?{getHasteName: string => ?string} */ = null;
let hasteImplModulePath /*: ?string */ = null;

function getHasteImpl(
  requestedModulePath /*: string */,
) /*: {getHasteName: string => ?string} */ {
  if (hasteImpl) {
    if (requestedModulePath !== hasteImplModulePath) {
      throw new Error('metro-file-map: hasteImplModulePath changed');
    }
    return hasteImpl;
  }
  hasteImplModulePath = requestedModulePath;
  // $FlowFixMe[unsupported-syntax] - dynamic require
  hasteImpl = require(hasteImplModulePath);
  return hasteImpl;
}

function sha1hex(content /*: string | Buffer */) /*: string */ {
  return createHash('sha1').update(content).digest('hex');
}

function worker(data /*: WorkerMessage */) /*: WorkerMetadata */ {
  let content /*: ?Buffer */;
  let dependencies /*: WorkerMetadata['dependencies'] */;
  let id /*: WorkerMetadata['id'] */;
  let sha1 /*: WorkerMetadata['sha1'] */;

  const {computeDependencies, computeSha1, enableHastePackages, filePath} =
    data;

  const getContent = () /*: Buffer */ => {
    if (content == null) {
      content = fs.readFileSync(filePath);
    }

    return content;
  };

  if (enableHastePackages && filePath.endsWith(PACKAGE_JSON)) {
    // Process a package.json that is returned as a PACKAGE type with its name.
    try {
      const fileData = JSON.parse(getContent().toString());

      if (fileData.name) {
        id = fileData.name;
      }
    } catch (err) {
      throw new Error(`Cannot parse ${filePath} as JSON: ${err.message}`);
    }
  } else if (
    (data.hasteImplModulePath != null || computeDependencies) &&
    !excludedExtensions.has(filePath.substr(filePath.lastIndexOf('.')))
  ) {
    // Process a random file that is returned as a MODULE.
    if (data.hasteImplModulePath != null) {
      id = getHasteImpl(data.hasteImplModulePath).getHasteName(filePath);
    }

    if (computeDependencies) {
      dependencies = Array.from(
        data.dependencyExtractor != null
          ? // $FlowFixMe[unsupported-syntax] - dynamic require
            require(data.dependencyExtractor).extract(
              getContent().toString(),
              filePath,
              dependencyExtractor.extract,
            )
          : dependencyExtractor.extract(getContent().toString()),
      );
    }
  }

  // If a SHA-1 is requested on update, compute it.
  if (computeSha1) {
    sha1 = sha1hex(getContent());
  }

  return content && data.maybeReturnContent
    ? {content, dependencies, id, sha1}
    : {dependencies, id, sha1};
}

module.exports = {
  worker,
};
