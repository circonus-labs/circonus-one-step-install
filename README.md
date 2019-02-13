# DEPRECATED

This version of cosi is no longer active. Please see [cosi-server](https://github.com/circonus-labs/cosi-server) and [cosi-tool](https://github.com/circonus-labs/cosi-tool) for the up-to-date version of cosi.

---


# COSI - The Circonus One Step Installer

The purpose of COSI is to simplify the task of getting metrics flowing from a new host into Circonus, consisting of:

1. Install and configure the [Circonus monitoring agent](https://github.com/circonus-labs/circonus-agent).

1. Create and configure a Circonus check that receives data from the agent.

1. Create graphs and worksheets for each of the basic metric groups (e.g. cpu, memory, disk, network, filesystem, etc.)

COSI automates all these steps with a single cut-n-paste command without inhibiting customization and orchestration/automation.
In addition it provides a command line utility command, for managing the Circonus check for the hosts.

## Quickstart

In most cases, you will want to use the Circonus UI to install COSI on your host:

1. Log into your Circonus Account

1. On the System Dashboard page, click `[New Host]` at top right, or from the Integrations -> Hosts page, click `New +` at top right.

1. Copy and run the command displayed on the host to be setup.

![Add Host Screenshot](https://cloud.githubusercontent.com/assets/2446981/20178396/38eeeec2-a751-11e6-93a1-1f3e828827c4.png)

## Content

This repository contains the following components:

* [COSI installer](https://github.com/circonus-labs/circonus-one-step-install/wiki/Installer).
  A shell script that interacts with the COSI site API.

* [COSI utility](/src/util).
  A command line utility for configuring metrics, checks, graphs and worksheets created by COSI.

* [COSI site](/src).
  A Node.js-based service that serves the COSI installer itself,
  templates, and pointers to circonus-agent packages. Most users will rely on the
  hosted COSI site provided by Circonus (<https://setup.circonus.com>).

The [COSI user documentation](https://github.com/circonus-labs/circonus-one-step-install/wiki) is in the wiki for this repository.
