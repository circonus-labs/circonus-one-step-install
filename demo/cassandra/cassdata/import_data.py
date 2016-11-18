#!/usr/bin/env python

from os import listdir, rename
from os.path import isfile, join
import time
from cassandra.cluster import Cluster

def import_data(file_name):
    cluster = Cluster(['192.168.10.11', '192.168.10.12', '192.168.10.13'])
    session = cluster.connect('wikimediaks')
    fh = open(file_name, 'r')
    num_inserted = 0
    for line in fh:
        project, page, requests, bytes_sent = line.rstrip().split()
        page = page.replace("'", '_')
        session.execute(
            "INSERT INTO pageviews (project, page, requests, bytes_sent) VALUES (%s, %s, %s, %s)",
            (project, page, int(requests), int(bytes_sent)))
        time.sleep(0.25)
        print "Inserted", project, page, requests, bytes_sent
        num_inserted += 1
    return num_inserted

def process_data():
    data_path = './data'
    done_path = join(data_path, 'done')
    data_files = [f for f in listdir(data_path) if isfile(join(data_path, f))]
    max_files = 10
    files_imported = 0
    total_records = 0

    for data_file in data_files:
        print "Importing data from", data_file
        total_records += import_data(join(data_path, data_file))
        rename(join(data_path, data_file), join(done_path, data_file))
        print "Done importing data from", data_file
        files_imported += 1
        if files_imported >= max_files:
            break
        print "Waiting 60s to resume"
        time.sleep(60)

    print "Imported", total_records, "from", files_imported, "files."

if __name__ == '__main__':
    process_data()
