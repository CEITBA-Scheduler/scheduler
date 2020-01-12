import { Injectable } from '@angular/core';
import { ISubject, ICommission, ICombination, IPriority, VerifierFunction, ISubjectSelection, Transform } from './algorithm-interface';
import { Combination, CombinationSubject } from './algorithm-object';

@Injectable({
  providedIn: 'root'
})
export class AlgorithmService {

  constructor() { }

  /**
   * Recursive algorithm to generate a list of all possible combinations between subjects.
   * @param subjects      List of selected subjects
   * @param verifier      Callable function to determine whether it should be included or not
   * @param combination   Combination being generated by the current tree path
   * @returns All possible combinations of commissions of subjects
   */
  private searchCombinations(subjects: ISubject[], verifier: VerifierFunction, combination: ICombination = null)
  : Combination[] {
    // When the function is first called, no combination has been generated, so
    // I need to create a default instance of this object
    if (combination === null) {
        combination = new Combination();
    }

    // Checking if we still have more subjects to continue with the tree of
    // possible combinations
    if (subjects.length > 0) {
        // Pops a subject from the list of subjects and iterates over all possible
        // commissions creating for each a new possible combination on the tree
        let combinations: Combination[] = [];
        const nodeSubject: ISubject = subjects.pop();
        const nodeCommissions: ICommission[] = nodeSubject.commissions;

        for (const nodeCommission of nodeCommissions) {
            const newCombination = JSON.parse(JSON.stringify(combination));
            const newSubject = new CombinationSubject(
              nodeSubject.name,
              nodeSubject.code,
              nodeCommission.hasOwnProperty('teachers') ? nodeCommission.professors : undefined,
              nodeCommission.label,
              nodeCommission.schedule
            );
            newCombination.subjects.push(newSubject);

            // Get the new possible combinations for each commission case and concatenates them
            // with the current result of combinations
            const recursiveCombinations = this.searchCombinations(subjects.slice(), verifier, newCombination);
            combinations = combinations.concat(recursiveCombinations);
        }

        // Returns the possible combinations
        return combinations;
    } else {
        // When there are not subjects left, we have to check if the current combination created
        // is valid according to the criteria or priorities taken by the algorithm user...
        return verifier(combination) ? [combination] : [];
    }
  }

  /**
   * Calculates the corresponding weight for a combination with the given priorities according
   * to the user's priority and subject selection.
   * @param combination       Combination being tested
   * @param priorities        Priorities being selected by the user
   * @param selectedSubjects  Subjects selected
   * @param transform         Transform function used for the weight algorithm
   */
  private computeWeight(combination: ICombination, priorities: IPriority[], selectedSubjects: ISubjectSelection[], transform: Transform)
  : void {
    combination.weight = this.weightAlgorithm(priorities, combination.priorities, selectedSubjects, transform);
  }

  /**
   * Algorithm that calculates the corresponding weight of each combination according to the user specifications.
   * @param priorities              List of priorities set by the user
   * @param combinationPriorities   List of priorities used by the current combination
   * @param subjects                List of subjects
   * @param transform               Callable function to transform values
   */
  private weightAlgorithm(priorities: IPriority[], combinationPriorities: number[], subjects: ISubjectSelection[], transform: Transform)
  : number {
    // 1°, calculate the base value for each priority amount
    const base = priorities.length * transform(priorities.length) * transform(subjects.length);

    // 2°, calculate the starting value for the amount of priorities of the combination
    const weight = base * combinationPriorities.length;

    // 3°, calculate the indexed value inside the range for the given amount of priorities
    let indexedWeight = 0;
    for (const index of combinationPriorities) {
        const currentPriority = priorities[index];
        if (currentPriority.relatedSubjectCode === null || currentPriority.relatedSubjectCode === undefined) {
            indexedWeight += transform(currentPriority.weight);
        } else {
          const currentSubject = subjects.find(subject => subject.code === currentPriority.relatedSubjectCode);
          indexedWeight += ( transform(currentPriority.weight) * transform(currentSubject.weight) );
        }

    }

    // 4°, return the resulting value
    return weight + indexedWeight;
  }

  /**
   * Returns a boolean, determining whether it should be included or not the combination.
   * @param combination Combination to be verified
   * @param priorities  List of priorities and criteria set by the user
   */
  private verifiesPriorities(combination: ICombination, priorities: IPriority[]): boolean {
    return true;
  }

  private getSuperposition(shedule1, schedule2) {

  }

  /**
   * Generates a list of all possible combinations, ordered by their weights which is calculated
   * by the weightAlgorithm according to the user's priorities.
   * @param subjects          List of all subjects
   * @param selectedSubjects  List of subjects selected
   * @param priorities        List of user's priorities
   */
  public schedulerAlgorithm(subjects: ISubject[], selectedSubjects: ISubjectSelection[], priorities: IPriority[]) {
        // 1°, run the combination algorithm to obtain all possible schedules and classify them by the criteria and priorities
        const chosenSubjects: ISubject[] = [];
        for (const selectedSubject of selectedSubjects) {
            const subject = subjects.find(element => element.code === selectedSubject.code);
            chosenSubjects.push(subject);
        }
        const verifier = (combination: ICombination) => this.verifiesPriorities(combination, priorities);
        let combinations = this.searchCombinations(chosenSubjects, verifier);

        // 2°, compute for every combination its weight, starting with a simple linear transformation... could be changed!
        function transformation(value: number) {
            const SLOPE = 10;
            return value * SLOPE;
        }

        for (const combination of combinations) {
          this.computeWeight(combination, priorities, selectedSubjects, transformation);
        }

        // 3°, run an ordering algorithm based on the previously calculated weight
        combinations = this.quicksort(
            combinations,
            0, combinations.length - 1,
            (combination: ICombination) => combination.weight,
            (current: number, pivot: number) => current < pivot
        );

        // 4°, return the result
        return combinations;
  }

  private quicksort(
    array: Array<any>,
    left: number,
    right: number,
    get = (element) => element,
    condition = (current, pivot) => current > pivot) {

    function swap(list: Array<any>, one: number, two: number): void {
        const auxiliar = list[one];
        list[one] = array[two];
        list[two] = auxiliar;
    }

    function partition(list: Array<any>, leftIndex: number, rightIndex: number, pivot: number): number {
        let partitionIndex = pivot;
        const pivotValue = get(list[pivot]);
        for (let i = leftIndex ; i <= rightIndex ; i++) {
            const currentValue = get(list[i]);
            if ( condition(currentValue, pivotValue) ) {
                while (partitionIndex > i) {
                    partitionIndex -= 1;
                    const swapingValue = get(list[partitionIndex]);
                    if ( !condition(swapingValue, pivotValue) ) {
                        swap(list, i, partitionIndex);
                        break;
                    }
                }

                if (partitionIndex <= i) {
                    swap(list, pivot, partitionIndex);
                    break;
                }
            }
        }

        return partitionIndex;
    }

    if (left < right) {
        // Choose a pivot value and creates both partitions of the array, ordering with the given condition
        const partitionIndex = partition(array, left, right, right);

        // Swaps the partition and the pivot values and calls recursively to the quicksort function on both partitions
        this.quicksort(array, left, partitionIndex - 1, get, condition);
        this.quicksort(array, partitionIndex + 1, right, get, condition);
    }

    return array;
  }
}
