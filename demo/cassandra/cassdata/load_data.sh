#!/usr/bin/env bash

cmd_list="python curl gzip split"
for cmd in $cmd_list; do
    echo "Checking for $cmd command"
    type -P $cmd
    [[ $? -eq 0 ]] || { echo "'$cmd' not found in PATH."; exit 1; }
done

echo "Checking for cassandra driver"
python -c 'import cassandra' 2>/dev/null
[[ $? -eq 0 ]] || { echo "Cassandra driver [for python] not found, install. e.g. 'pip install cassandra-driver'"; exit 1; }

set -o nounset
set -o errexit

echo "Checking for sample data"
data_gz=pagecounts-20160801-000000.gz
if [[ ! -f $data_gz ]]; then
    data_url="https://dumps.wikimedia.org/other/pagecounts-raw/2016/2016-08/${data_gz}"
    echo "Downloading sample data"
    curl $data_url -o $data_gz
    echo "Done, 'rm $data_gz' to force download"
fi

echo "Checking for sample data chunks"
if [[ ! -d data ]]; then
    echo "Creating data directory (for chunk files)"
    mkdir data
    pushd data
    echo "Creating done directory (for completed chunk files)"
    [[ ! -d done ]] && mkdir done
    echo "Creating chunks of data to import"
    gzip -dc ../$data_gz | split -a 5
    popd
    echo "Done, 'rm -rf data' to recreate chunks, 'cd data && mv done/* .' to re-import data chunks."
fi

echo "Importing data into demo cassandra cluster"
[[ ! -x import_data.py ]] && chmod 755 import_data.py
./import_data.py
