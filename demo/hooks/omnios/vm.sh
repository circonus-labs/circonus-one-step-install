#!/bin/sh
DIR=`dirname $0`
if [ -d $DIR/illumos ]; then . $DIR/illumos/lib/kstat.lib
else . $DIR/lib/kstat.lib
fi

physmem=`_kstat_val :::physmem`
pagesfree=`_kstat_val :::pagesfree`
pagesused=$(($physmem-$pagesfree))
pagesize=`pagesize`
a=$(($physmem * $pagesize))
b=$(($pagesused * $pagesize))
mem_perc=`printf "%s\n" "scale = 2; $b/$a" | bc `

printf "mempercent_used\tn\t%0.2f\n" $mem_perc

# add memory pageszie (as it's required to calculate
# derivatives from the kstat output)
printf "mem_pagesize\tL\t%d\n" $pagesize

# pre-calculate the available swap since cosi will
# use it in a graph
swap_avail_pages=`_kstat_val ::vminfo:swap_avail`
vminfo_updates=`_kstat_val ::vminfo:updates`
swap_avail=$((($swap_avail_pages * $pagesize) / $vminfo_updates))
printf "swap_avail\tL\t%d\n" $swap_avail

_kstat -n vminfo
