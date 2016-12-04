CREATE KEYSPACE wikimediaks WITH REPLICATION = { 'class' : 'SimpleStrategy' , 'replication_factor' : 1 };
use wikimediaks;
CREATE TABLE pageviews (
  project text,
  page text,
  requests int,
  bytes_sent bigint,
  PRIMARY KEY (project, page)
  );
