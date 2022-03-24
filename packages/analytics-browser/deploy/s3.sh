#!/bin/bash

version=$SDK_VERSION
bucket=$BUCKET_NAME
lib=lib/scripts/
amp=amplitude

echo "[Deployment to AWS S3] Compress minified files"
for min in "-min" "-min.umd"
do
  file=${lib}${amp}${min}.js
  echo "INFO: Compressing ${file}..."
  gzip < ${lib}${amp}${min}.js > ${lib}${amp}${min}.gz.js
done

echo "[Deployment to AWS S3] Upload SDK"
for postfix in ".js" "-min.js" ".umd.js" "-min.umd.js" "-min.gz.js" "-min.umd.gz.js"
do
  sdk="${amp}-${version}${postfix}"
  key=libs/${sdk}

  params=()
  if [[ $postfix == *".gz.js" ]]; then
    params+=(--content-encoding 'gzip')
  fi

  echo "INFO: Checking if object ${sdk} exists in target bucket..."
  obj_exists=$(aws s3api head-object \
  --bucket ${bucket} \
  --key libs/${sdk})

  if [ -z "${obj_exists}" ]; then
    echo "INFO: Object ${sdk} does not exist in target bucket. Uploading ${sdk}..."
    aws s3api put-object \
    --bucket ${bucket} \
    --key ${key} \
    --body ${lib}${amp}${postfix} \
    --content-type "application/javascript" \
    --cache-control "max-age=31536000" \
    "${params[@]}" \
    2>&1 > /dev/null
  else
    echo "WARNING: Object ${sdk} exists in target bucket. Skipping upload for ${sdk}..."
  fi
done
